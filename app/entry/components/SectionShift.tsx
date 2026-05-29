"use client";
// PR c94-C-2: ⑥ 体制セクション (全 5 業態共通)。
//   車両数 (vehicle_count) + 研修生・営業マン (trainee_count) のスナップショット入力。
//   両値は MAX 集計 (累積でなく当日断面)。SnapshotCountField で「前回値継承」UI を提供。
//
// snapshot は EntryForm が entriesByDate から「現在日より前の最大日」entry の値を算出し、
// vehicleSnapshot / traineeSnapshot として渡す (月の最初の入力日は null = 継承なし)。

import SectionShell from "./SectionShell";
import SnapshotCountField from "./SnapshotCountField";
import type { EntryFormState, ValidationErrors, InputFieldKey, InputValue } from "../types";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  errors: ValidationErrors;
  vehicleSnapshot: number | null;
  traineeSnapshot: number | null;
  defaultOpen?: boolean;
};

export default function SectionShift({
  state, setField, errors, vehicleSnapshot, traineeSnapshot, defaultOpen,
}: Props) {
  return (
    <SectionShell
      title="⑥ 体制"
      subtitle="車両数・研修生（スナップショット）"
      group="cnt"
      count={2}
      defaultOpen={defaultOpen}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <SnapshotCountField
          label="車両数" unit="台" emoji="🚗"
          value={state.vehicle_count}
          onChange={(v) => setField("vehicle_count", v)}
          initialFromLastSnapshot={vehicleSnapshot}
          error={errors.vehicle_count}
        />
        <SnapshotCountField
          label="研修生（営業マン）" unit="人" emoji="👤"
          value={state.trainee_count}
          onChange={(v) => setField("trainee_count", v)}
          initialFromLastSnapshot={traineeSnapshot}
          error={errors.trainee_count}
        />
      </div>
    </SectionShell>
  );
}
