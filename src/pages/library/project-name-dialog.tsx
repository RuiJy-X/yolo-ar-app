import { useState, useEffect } from "react";
import { X } from "lucide-react";

type ProjectNameDialogProps = {
  isOpen: boolean;
  initialValue: string;
  onConfirm: (projectName: string) => void;
  onCancel: () => void;
};

const ProjectNameDialog = ({
  isOpen,
  initialValue,
  onConfirm,
  onCancel,
}: ProjectNameDialogProps) => {
  const [projectName, setProjectName] = useState(initialValue);

  useEffect(() => {
    setProjectName(initialValue);
  }, [initialValue, isOpen]);

  const handleConfirm = () => {
    if (projectName.trim()) {
      onConfirm(projectName.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in zoom-in-95 duration-200">
        <div
          className="bg-white rounded-lg shadow-lg w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#ededed]">
            <h2 className="text-[16px] font-semibold text-[#171717]">
              Save Project
            </h2>
            <button
              onClick={onCancel}
              className="text-[#9a9a9a] hover:text-[#171717] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[#171717] mb-2">
                Project Name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter a name for your project"
                autoFocus
                className="w-full px-3 py-2 rounded-[6px] border border-[#dfdfdf] bg-[#ffffff] text-[14px] text-[#171717] placeholder-[#9a9a9a] focus:outline-none focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]/30 transition-colors"
              />
              <p className="text-[12px] text-[#9a9a9a] mt-1">
                Give your analysis a descriptive name for easy reference
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-6 py-4 border-t border-[#ededed] justify-end">
            <button
              onClick={onCancel}
              className="inline-flex items-center px-4 py-2 rounded-[6px] text-[13px] font-medium border border-[#dfdfdf] bg-[#ffffff] text-[#171717] hover:bg-[#fafafa] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!projectName.trim()}
              className="inline-flex items-center px-4 py-2 rounded-[6px] text-[13px] font-medium bg-[#0052ff] text-[#ffffff] hover:bg-[#0041cc] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProjectNameDialog;
