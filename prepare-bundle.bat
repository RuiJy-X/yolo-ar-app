@echo off
echo Cleaning old bundle...
rmdir /s /q backend-bundle 2>nul

echo Creating clean backend bundle...
mkdir backend-bundle

echo Copying source files...
copy backend\act_reg_final_version\websocket_api.py backend-bundle\
copy backend\act_reg_final_version\utils.py backend-bundle\

echo Copying packages...
xcopy /E /I /Y /Q backend\act_reg_final_version\feeders backend-bundle\feeders\
xcopy /E /I /Y /Q backend\act_reg_final_version\graph backend-bundle\graph\
xcopy /E /I /Y /Q backend\act_reg_final_version\model backend-bundle\model\

echo Copying FFmpeg...
xcopy /E /I /Y /Q backend\act_reg_final_version\ffmpeg backend-bundle\ffmpeg\

echo Copying models...
copy backend\act_reg_final_version\yolo-best.pt backend-bundle\
copy backend\act_reg_final_version\yolo11n-pose.pt backend-bundle\
copy backend\act_reg_final_version\yolo26n-pose.pt backend-bundle\
xcopy /E /I /Y /Q backend\act_reg_final_version\results backend-bundle\results\

echo Copying frontend build...
xcopy /E /I /Y /Q dist backend-bundle\frontend\

echo Done. backend-bundle is ready.