from __future__ import annotations

import logging
import threading
import time
from typing import Any

import numpy as np

logger = logging.getLogger("tello_manager")

try:
    from djitellopy import Tello
    TELLO_AVAILABLE = True
except ImportError:
    Tello = None
    TELLO_AVAILABLE = False
    logger.warning("djitellopy package not found. Install via 'pip install djitellopy'.")

# The Tello pushes H.264 over UDP in ~1.4 KB packets. djitellopy opens the
# socket with FFmpeg's defaults (64 KB receive buffer, no FIFO), so a single
# 960x720 keyframe can overflow it whenever the decode thread is starved by
# YOLO inference -> dropped packets -> grey smears / blocky macroblocks.
#   buffer_size      : OS socket receive buffer (SO_RCVBUF), bytes
#   fifo_size        : FFmpeg circular buffer, in 188-byte units (~9.4 MB)
#   overrun_nonfatal : keep decoding instead of erroring if the FIFO fills
TELLO_VIDEO_URL = (
    "udp://@0.0.0.0:{port}"
    "?buffer_size=8388608&fifo_size=50000&overrun_nonfatal=1"
)
TELLO_STREAM_OPEN_TIMEOUT_S = 7.0

try:
    import av
except ImportError:  # djitellopy depends on PyAV, so this only trips without it
    av = None


class TelloVideoReader:
    """Background H.264 decoder that keeps only the newest frame.

    Replaces djitellopy's BackgroundFrameRead, which
      * decodes via PIL (`frame.to_image()`) and needs an extra RGB->BGR pass:
        ~2.2x the CPU of `to_ndarray(format="bgr24")` for identical pixels,
      * dies permanently on the first decoder exception (frozen video),
      * gives callers no way to tell a new frame from one they already saw,
        so consumers re-process duplicates.

    `latest()` returns `(seq, frame)`; `seq` increases by one per decoded
    frame and the frame array is read-only (shared between consumers).
    """

    def __init__(
        self,
        address: str,
        open_timeout: float = TELLO_STREAM_OPEN_TIMEOUT_S,
        read_timeout: float = 2.0,
    ):
        if av is None:
            raise RuntimeError("PyAV is not installed.")
        self.address = address
        self.open_timeout = open_timeout
        self.read_timeout = read_timeout
        self._lock = threading.Lock()
        self._frame: np.ndarray | None = None
        self._seq = 0
        self.decode_errors = 0
        self.reopens = 0
        self.stopped = False
        # First open happens here so connect() reports a dead stream immediately.
        self.container = self._open()
        self._worker = threading.Thread(target=self._run, name="tello-video", daemon=True)
        self._worker.start()

    def _open(self):
        # The read timeout lets the thread notice stop() and recover from a
        # Wi-Fi dropout instead of blocking forever on a silent socket.
        return av.open(self.address, timeout=(self.open_timeout, self.read_timeout))

    def _run(self) -> None:
        while not self.stopped:
            try:
                if self.container is None:
                    self.container = self._open()
                    self.reopens += 1
                for packet in self.container.demux(video=0):
                    if self.stopped:
                        break
                    try:
                        frames = packet.decode()
                    except av.error.FFmpegError:
                        # Corrupt/missing packet: skip it, the next keyframe heals the image.
                        self.decode_errors += 1
                        continue
                    for vf in frames:
                        img = vf.to_ndarray(format="bgr24")
                        img.flags.writeable = False
                        with self._lock:
                            self._frame = img
                            self._seq += 1
            except Exception as exc:  # read timeout, or stream ended
                if not self.stopped:
                    logger.warning(f"Tello video stream interrupted ({exc}); reopening...")
            finally:
                if self.container is not None:
                    try:
                        self.container.close()
                    except Exception:
                        pass
                    self.container = None
            if not self.stopped:
                time.sleep(0.2)

    def latest(self) -> tuple[int, np.ndarray] | None:
        with self._lock:
            if self._frame is None:
                return None
            return self._seq, self._frame

    @property
    def frame(self) -> np.ndarray | None:
        item = self.latest()
        return None if item is None else item[1]

    def stop(self) -> None:
        """Same name djitellopy's streamoff()/end() call on its reader."""
        self.stopped = True


class TelloManager:
    """
    Thread-safe manager for Ryze Tello drone connection, telemetry, 
    video stream reader, and flight controls.
    """
    _instance: TelloManager | None = None
    _lock = threading.Lock()

    def __new__(cls) -> TelloManager:
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init_manager()
            return cls._instance

    def _init_manager(self) -> None:
        self.drone: Any | None = None
        self.connected = False
        self.is_flying = False
        self.frame_read = None
        self.last_error = ""
        self.control_lock = threading.Lock()
        self.connection_time = 0.0

    def connect(self) -> tuple[bool, str]:
        """Attempt connection to the Tello drone."""
        with self.control_lock:
            if not TELLO_AVAILABLE:
                self.last_error = "djitellopy library is not installed in Python environment."
                return False, self.last_error

            if self.connected and self.drone is not None:
                return True, "Already connected to Tello drone."

            try:
                drone = Tello()
                drone.RESPONSE_TIMEOUT = 7
                drone.RETRY_COUNT = 3

                try:
                    drone.connect(wait_for_state=True)
                except Exception as state_err:
                    logger.warning(f"State packet check failed ({state_err}). Retrying with wait_for_state=False...")
                    drone.connect(wait_for_state=False)

                # Enable camera video stream
                try:
                    drone.streamon()
                    self.frame_read = TelloVideoReader(
                        TELLO_VIDEO_URL.format(port=drone.vs_udp_port)
                    )
                    # Registered so djitellopy's streamoff()/end() stop it too.
                    drone.background_frame_read = self.frame_read
                except Exception as stream_err:
                    logger.warning(f"Warning starting stream: {stream_err}")

                self.drone = drone
                self.connected = True
                self.connection_time = time.time()
                self.last_error = ""
                logger.info("Successfully connected to Tello drone.")
                return True, "Successfully connected to Tello drone."
            except Exception as e:
                err_msg = str(e)
                self.last_error = (
                    f"Connection failed: {err_msg}. "
                    "Make sure Windows Defender Firewall is not blocking Python UDP ports (8889, 8890, 11111)."
                )
                self.connected = False
                self.drone = None
                self.frame_read = None
                logger.error(f"Tello connection error: {err_msg}")
                return False, self.last_error

    def _stop_reader(self) -> None:
        # streamoff() only stops the reader if the drone answers; do it ourselves
        # so the UDP video port is released even when the drone is gone.
        reader, self.frame_read = self.frame_read, None
        if reader is not None:
            try:
                reader.stop()
            except Exception:
                pass

    def disconnect(self) -> tuple[bool, str]:
        """Safely land (if flying) and disconnect from Tello drone."""
        with self.control_lock:
            if not self.drone:
                self.connected = False
                return True, "Drone was not connected."

            try:
                if self.is_flying:
                    try:
                        self.drone.land()
                    except Exception:
                        pass
                    self.is_flying = False

                try:
                    self.drone.streamoff()
                except Exception:
                    pass

                try:
                    self.drone.end()
                except Exception:
                    pass

                self._stop_reader()
                self.drone = None
                self.connected = False
                return True, "Disconnected from Tello drone."
            except Exception as e:
                self._stop_reader()
                self.drone = None
                self.connected = False
                return False, f"Error during disconnect: {e}"

    def get_telemetry(self) -> dict[str, Any]:
        """Retrieve current drone state telemetry."""
        if not self.connected or not self.drone:
            return {
                "connected": False,
                "is_flying": False,
                "battery": 0,
                "flight_time": 0,
                "height": 0,
                "temperature": 0,
                "pitch": 0,
                "roll": 0,
                "yaw": 0,
                "wifi_snr": 0,
                "last_error": self.last_error,
            }

        try:
            # Query Tello state metrics safely
            battery = getattr(self.drone, "get_battery", lambda: 0)()
            height = getattr(self.drone, "get_height", lambda: 0)()
            flight_time = getattr(self.drone, "get_flight_time", lambda: 0)()
            temp = getattr(self.drone, "get_highest_temperature", lambda: 0)()
            pitch = getattr(self.drone, "get_pitch", lambda: 0)()
            roll = getattr(self.drone, "get_roll", lambda: 0)()
            yaw = getattr(self.drone, "get_yaw", lambda: 0)()
            wifi_snr = getattr(self.drone, 'get_wifi', lambda: 0)()

            # Convert any potential exception returns to integers
            def safe_int(val: Any) -> int:
                try:
                    return int(val)
                except Exception:
                    return 0

            return {
                "connected": True,
                "is_flying": self.is_flying,
                "battery": safe_int(battery),
                "flight_time": safe_int(flight_time),
                "height": safe_int(height),
                "temperature": safe_int(temp),
                "pitch": safe_int(pitch),
                "roll": safe_int(roll),
                "yaw": safe_int(yaw),
                "wifi_snr": safe_int(wifi_snr),
                "last_error": self.last_error,
            }
        except Exception as e:
            return {
                "connected": True,
                "is_flying": self.is_flying,
                "battery": 0,
                "flight_time": 0,
                "height": 0,
                "temperature": 0,
                "pitch": 0,
                "roll": 0,
                "yaw": 0,
                "wifi_snr": 0,
                "last_error": f"Telemetry read error: {e}",
            }


    def get_latest_frame(self) -> tuple[int, np.ndarray] | None:
        """Newest decoded frame as `(seq, bgr_frame)`, without copying.

        The array is read-only and shared: copy it before drawing on it.
        `seq` lets callers skip frames they have already processed.
        """
        reader = self.frame_read
        if not self.connected or reader is None:
            return None
        try:
            return reader.latest()
        except Exception as e:
            logger.warning(f"Error fetching Tello frame: {e}")
            return None

    def get_frame(self) -> np.ndarray | None:
        """Fetch current image frame from Tello camera feed as a writable BGR copy."""
        item = self.get_latest_frame()
        return None if item is None else item[1].copy()

    def send_rc_control(self, left_right: int, forward_backward: int, up_down: int, yaw: int) -> bool:
        """
        Send continuous manual velocity vectors (-100 to 100).
        """
        if not self.connected or not self.drone:
            return False
        try:
            lr = max(-100, min(100, int(left_right)))
            fb = max(-100, min(100, int(forward_backward)))
            ud = max(-100, min(100, int(up_down)))
            y = max(-100, min(100, int(yaw)))
            
            self.drone.send_rc_control(lr, fb, ud, y)
            return True
        except Exception as e:
            logger.error(f"Error sending RC command: {e}")
            return False

    def takeoff(self) -> tuple[bool, str]:
        if not self.connected or not self.drone:
            return False, "Drone not connected."
        try:
            self.drone.takeoff()
            self.is_flying = True
            return True, "Takeoff command issued."
        except Exception as e:
            return False, f"Takeoff failed: {e}"

    def land(self) -> tuple[bool, str]:
        if not self.connected or not self.drone:
            return False, "Drone not connected."
        try:
            self.drone.land()
            self.is_flying = False
            return True, "Landing command issued."
        except Exception as e:
            return False, f"Landing failed: {e}"

    def emergency(self) -> tuple[bool, str]:
        if not self.connected or not self.drone:
            return False, "Drone not connected."
        try:
            self.drone.emergency()
            self.is_flying = False
            return True, "Emergency stop issued!"
        except Exception as e:
            return False, f"Emergency command failed: {e}"

    def flip(self, direction: str) -> tuple[bool, str]:
        if not self.connected or not self.drone:
            return False, "Drone not connected."
        try:
            d = direction.lower().strip()
            if d not in ("l", "r", "f", "b"):
                return False, "Invalid flip direction. Must be 'l', 'r', 'f', or 'b'."
            self.drone.flip(d)
            return True, f"Flipped {d}."
        except Exception as e:
            return False, f"Flip failed: {e}"


tello_manager = TelloManager()
