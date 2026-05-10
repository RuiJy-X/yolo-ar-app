const AccuracyCard = ({ label, value }: { label: string; value: string }) => {
  return (
    <div className="bg-white p-6 rounded-lg border-l-4 border-l-primary-container border-y border-r border-slate-200 shadow-sm">
      <p className="font-label-caps text-label-caps text-slate-500 uppercase mb-2">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <span className="font-data-display text-data-display text-on-surface">
          {value}%
        </span>
      </div>
    </div>
  );
};

export default AccuracyCard;
