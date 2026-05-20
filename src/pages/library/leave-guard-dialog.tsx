import { X } from "lucide-react";

type LeaveGuardDialogProps = {
  isOpen: boolean;
  onStay: () => void;
  onSave: () => void;
  onReset: () => void;
};

const LeaveGuardDialog = ({
  isOpen,
  onStay,
  onSave,
  onReset,
}: LeaveGuardDialogProps) => {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
        onClick={onStay}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in zoom-in-95 duration-200">
        <div
          className="bg-white rounded-lg shadow-lg w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#ededed]">
            <h2 className="text-[16px] font-semibold text-[#171717]">
              Save current analysis?
            </h2>
            <button
              onClick={onStay}
              className="text-[#9a9a9a] hover:text-[#171717] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="px-6 py-4 space-y-3">
            <p className="text-[13px] text-[#5c5c5c]">
              You have an unsaved analysis. Save it to the library or reset the
              data before uploading another video.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 px-6 py-4 border-t border-[#ededed] justify-end">
            <button
              onClick={onReset}
              className="inline-flex items-center px-4 py-2 rounded-[6px] text-[13px] font-medium border border-[#dfdfdf] bg-[#fff5f5] text-[#b42318] hover:bg-[#ffe3e3] transition-colors"
            >
              Reset Data
            </button>
            <button
              onClick={onStay}
              className="inline-flex items-center px-4 py-2 rounded-[6px] text-[13px] font-medium border border-[#dfdfdf] bg-[#ffffff] text-[#171717] hover:bg-[#fafafa] transition-colors"
            >
              Stay
            </button>
            <button
              onClick={onSave}
              className="inline-flex items-center px-4 py-2 rounded-[6px] text-[13px] font-medium bg-[#0052ff] text-[#ffffff] hover:bg-[#0041cc] transition-colors"
            >
              Save to Library
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default LeaveGuardDialog;
