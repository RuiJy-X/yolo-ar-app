import { Activity, AlertTriangle, Clock, ShieldCheck } from "lucide-react";
import type { AnalyzeVideoResponse } from "@/lib/types";
import SummaryCard from "@/components/summary-card";

type MetricsCardsProps = {
  analysis: AnalyzeVideoResponse | null;
};

const asPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const MetricsCards = ({ analysis }: MetricsCardsProps) => {
  if (!analysis) {
    return (
      <section className="w-full">
        <div className="flex gap-2 w-full">
          <SummaryCard
            icon={<ShieldCheck className="size-4 text-blue-900" />}
            label="InfoGCN Accuracy"
          >
            <div className="text-3xl  font-bold text-black">N/A</div>
          </SummaryCard>

          <SummaryCard
            icon={<Activity className="size-4 text-blue-900" />}
            label="Yolo Metrics"
          >
            <div className="flex justify-around gap-4 text-sm font-bold text-black">
              <div className="text-3xl  font-bold text-black">
                N/A <p className="text-xs text-gray-600">Precision</p>
              </div>
              <div className="text-3xl  font-bold text-black">
                N/A <p className="text-xs text-gray-600">Recall</p>
              </div>
            </div>
          </SummaryCard>

          <SummaryCard
            icon={<AlertTriangle className="size-4 text-red-800" />}
            label="Active Alerts"
          >
            <div className="text-lg font-bold text-[#991B1B]">N/A</div>
          </SummaryCard>

          <SummaryCard
            icon={<Clock className="size-4 text-blue-900" />}
            label="Action Confidence"
          >
            <div className="space-y-1 text-xs text-[#344054]">N/A</div>
          </SummaryCard>
        </div>
      </section>
    );
  }

  const metric = analysis.summary_metrics;
  const actionScores = Object.entries(analysis.action_confidence_scores).sort(
    (a, b) => b[1] - a[1],
  );
  const activeAlerts = analysis.alert_events.length;

  return (
    <section className="w-full">
      <div className="flex gap-2 w-full">
        <SummaryCard
          icon={<ShieldCheck className="size-4 text-blue-900" />}
          label="InfoGCN Accuracy"
        >
          {asPercent(metric.infogcn_accuracy)}
        </SummaryCard>

        <SummaryCard
          icon={<Activity className="size-4 text-blue-900" />}
          label="Yolo Metrics"
        >
          <div className="flex flex-1 justify-around gap-4 text-sm font-bold text-black">
            <div className="text-3xl flex justify-center flex-col align-center w-full font-bold text-black">
              {asPercent(metric.yolo_precision)}
              <p className="text-xs text-gray-600">Precision</p>
            </div>
            <div className="text-3xl w-full  font-bold text-black">
              {asPercent(metric.yolo_recall)}
              <p className="text-xs text-gray-600">Recall</p>
            </div>
          </div>
        </SummaryCard>

        <SummaryCard
          icon={<AlertTriangle className="size-4 text-red-800" />}
          label="Active Alerts"
        >
          <div className="font-heading font-bold text-3xl  font-bold  grow  align-middle flex items-center justify-start text-[#991B1B]">
            {activeAlerts}
          </div>
        </SummaryCard>

        <SummaryCard
          icon={<Clock className="size-4 text-blue-900" />}
          label="Action Confidence"
        >
          <div className="space-y-1 text-xs text-[#344054] ">
            {actionScores.slice(0, 3).map(([action, score]) => (
              <div key={action} className="flex items-center justify-between">
                <span className="font-semibold">{asPercent(score)}</span>
                <span>{action}</span>
              </div>
            ))}
          </div>
        </SummaryCard>
      </div>
    </section>
  );
};

export default MetricsCards;
