import { CheckCircle2, X } from "lucide-react";

type SaveToastProps = {
  message: string | null;
  onDismiss: () => void;
};

const SaveToast = ({ message, onDismiss }: SaveToastProps) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 shadow-lg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        </div>
        <p className="text-[14px] font-medium text-green-800">{message}</p>
        <button
          onClick={onDismiss}
          className="text-green-600 hover:bg-green-100 rounded p-0.5 ml-2 transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default SaveToast;
