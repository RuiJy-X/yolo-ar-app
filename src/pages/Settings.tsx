import AppLayout from "@/applayout";
import Config from "./library/config";

const Settings = () => {
  return (
    <AppLayout>
      <div className="flex flex-col w-full h-full overflow-hidden">
        <Config className="h-full w-full" />
      </div>
    </AppLayout>
  );
};

export default Settings;
