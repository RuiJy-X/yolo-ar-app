import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import skysightLogo from "../assets/skysightlogo.png";
import skysightBrand from "../assets/skysightbrand.png";

type Stage = "logo" | "buttons";

const Splash = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("logo");
  const [logoVisible, setLogoVisible] = useState(false);
  const [buttonsVisible, setButtonsVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLogoVisible(true), 100);
    const t2 = setTimeout(() => {
      setStage("buttons");
      setTimeout(() => setButtonsVisible(true), 100);
    }, 100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center">
      {/* Logo + brand stacked, negative margins cancel built-in image padding */}
      <div
        className="flex flex-col items-center transition-all duration-700 ease-out z-0"
        style={{
          opacity: logoVisible ? 1 : 0,
          transform: logoVisible ? "translateY(0)" : "translateY(12px)",
        }}
      >
        <img src={skysightLogo} alt="" className="w-md mb-5" />
        <img
          src={skysightBrand}
          alt="Skysight"
          className="w-sm object-contain"
        />
      </div>

      {/* Buttons */}
      {stage === "buttons" && (
        <div
          className="flex flex-col items-center gap-3 mt-10 transition-all duration-500 ease-out z-100"
          style={{
            opacity: buttonsVisible ? 1 : 0,
            transform: buttonsVisible ? "translateY(0)" : "translateY(10px)",
          }}
        >
          {/* <button className="w-52 py-2.5 rounded-lg border border-gray-200 bg-white text-[#171717] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#171717" strokeWidth="1.2" />
              <polygon points="6.5,5.5 11.5,8 6.5,10.5" fill="#171717" />
            </svg>
            Watch tutorial
          </button> */}

          <button
            onClick={() => navigate("/home")}
            className="w-52 py-2.5 rounded-lg bg-[#0052ff] text-white text-sm font-semibold hover:bg-[#0041cc] transition-colors cursor-pointer"
          >
            Continue to app →
          </button>
        </div>
      )}
    </div>
  );
};

export default Splash;