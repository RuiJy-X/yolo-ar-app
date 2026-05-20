type LeaveProgressDialogProps = {
  isOpen: boolean;
  onCancel: () => void;
  onLeave: () => void;
};

const LeaveProgressDialog = ({
  isOpen,
  onCancel,
  onLeave,
}: LeaveProgressDialogProps) => {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in zoom-in-95 duration-200">
        <div
          className="bg-white rounded-lg shadow-lg w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-[#ededed]">
            <h2 className="text-[16px] font-semibold text-[#171717]">
              Leave while analyzing?
            </h2>
          </div>

          <div className="px-6 py-4 space-y-3">
            <p className="text-[13px] text-[#5c5c5c]">
              Analysis is still running. If you leave now, the progress will be
              lost.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 px-6 py-4 border-t border-[#ededed] justify-end">
            <button
              onClick={onCancel}
              className="inline-flex items-center px-4 py-2 rounded-[6px] text-[13px] font-medium border border-[#dfdfdf] bg-[#ffffff] text-[#171717] hover:bg-[#fafafa] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onLeave}
              className="inline-flex items-center px-4 py-2 rounded-[6px] text-[13px] font-medium bg-[#0052ff] text-[#ffffff] hover:bg-[#0041cc] transition-colors"
            >
              Leave Page
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default LeaveProgressDialog;
