"use client";

import {
  BarChart, Bar, Cell, LabelList, ResponsiveContainer, XAxis, YAxis, Tooltip,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { TIER_COLORS } from "./theme";

const tooltipStyle = {
  background: "var(--border)",
  border: "1px solid #2d3040",
  borderRadius: 6,
  fontSize: 12,
  color: "var(--text)",
};

export function TierDistributionChart({
  data,
}: {
  data: { tier: string; count: number; fill: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} barSize={36}>
        <XAxis dataKey="tier" tick={{ fill: "var(--faint)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "var(--faint)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((e, i) => (
            <Cell key={i} fill={e.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PillarCoverageChart({
  data,
}: {
  data: { pillar: string; coverage: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} barSize={16} layout="vertical" margin={{ left: 8, right: 28 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="pillar" tick={{ fill: "var(--text)", fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff08" }} formatter={(v) => [`${v}%`, "ready"]} />
        <Bar dataKey="coverage" fill="#3b82f6" radius={[0, 4, 4, 0]} background={{ fill: "var(--border)" }}>
          <LabelList dataKey="coverage" position="right" formatter={(v: number) => `${v}%`} style={{ fill: "var(--muted)", fontSize: 10 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RiskRadarChart({
  data,
  tier,
}: {
  data: { area: string; value: number }[];
  tier: number;
}) {
  const c = TIER_COLORS[tier] ?? "#3b82f6";
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data}>
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="area" tick={{ fill: "var(--faint)", fontSize: 10 }} />
        <PolarRadiusAxis domain={[0, 4]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={c} fill={c} fillOpacity={0.2} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
