import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

const CFRP_BULK = 1600; // kg/m3
const G = 9.81;

function airDensityAtAltitude(alt_m) {
  // Standard atmosphere approximation
  return 1.225 * Math.exp(-alt_m / 8500);
}

function calcSphere(radius, gyroidFill, internalPressureFrac, matDensityOverride, altitude_m) {
  const rho_air = airDensityAtAltitude(altitude_m);
  const rho_inside = rho_air * internalPressureFrac;
  const effectiveShellDensity = matDensityOverride * (gyroidFill / 100);

  const V_total = (4 / 3) * Math.PI * radius ** 3;
  const A_surface = 4 * Math.PI * radius ** 2;

  // Shell thickness for neutral buoyancy (just shell, no payload)
  // rho_air * V = effectiveShellDensity * A * t + rho_inside * V
  // t = (rho_air - rho_inside) * V / (effectiveShellDensity * A)
  const neutralT = ((rho_air - rho_inside) * V_total) / (effectiveShellDensity * A_surface);

  return { rho_air, V_total, A_surface, neutralT, effectiveShellDensity };
}

function formatNum(n, decimals = 2) {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(decimals) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(decimals) + "k";
  return n.toFixed(decimals);
}

const Stat = ({ label, value, unit, highlight, warn }) => (
  <div style={{
    padding: "12px 16px",
    background: highlight ? "rgba(0,255,180,0.07)" : warn ? "rgba(255,80,80,0.07)" : "rgba(255,255,255,0.03)",
    border: `1px solid ${highlight ? "rgba(0,255,180,0.3)" : warn ? "rgba(255,80,80,0.3)" : "rgba(255,255,255,0.08)"}`,
    borderRadius: 6,
    display: "flex", flexDirection: "column", gap: 2
  }}>
    <div style={{ fontSize: 10, color: "#888", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "monospace" }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: highlight ? "#00ffb4" : warn ? "#ff6060" : "#e8e8e8", fontFamily: "monospace" }}>
      {value} <span style={{ fontSize: 12, fontWeight: 400, color: "#666" }}>{unit}</span>
    </div>
  </div>
);

const Slider = ({ label, min, max, step, value, onChange, format }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "monospace" }}>
      <span style={{ color: "#aaa", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ color: "#00ffb4" }}>{format ? format(value) : value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{ width: "100%", accentColor: "#00ffb4", cursor: "pointer" }} />
  </div>
);

export default function VacuumAirshipCalc() {
  const [radius, setRadius] = useState(25);
  const [gyroidFill, setGyroidFill] = useState(10);
  const [internalPressure, setInternalPressure] = useState(20);
  const [shellThicknessCm, setShellThicknessCm] = useState(3);
  const [altitude, setAltitude] = useState(3048); // 10,000 ft

  const matDensity = CFRP_BULK;

  const { rho_air, V_total, A_surface, neutralT, effectiveShellDensity } = useMemo(
    () => calcSphere(radius, gyroidFill, internalPressure / 100, matDensity, altitude),
    [radius, gyroidFill, internalPressure, altitude]
  );

  const shellT = shellThicknessCm / 100;
  const shellVolume = A_surface * shellT;
  const shellMass = effectiveShellDensity * shellVolume;
  const internalAirMass = rho_air * (internalPressure / 100) * V_total;
  const totalStructureMass = shellMass + internalAirMass;
  const displacedAirMass = rho_air * V_total;
  const netLiftKg = displacedAirMass - totalStructureMass;
  const netLiftTonnes = netLiftKg / 1000;
  const neutralThicknessCm = neutralT * 100;

  const feasible = netLiftKg > 0;

  // Chart: net lift vs radius for current settings
  const chartData = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const r = 1 + i * 2;
      const { rho_air: ra, V_total: V, A_surface: A, effectiveShellDensity: esd } = calcSphere(r, gyroidFill, internalPressure / 100, matDensity, altitude);
      const sV = A * shellT;
      const sM = esd * sV;
      const iM = ra * (internalPressure / 100) * V;
      const lift = ra * V - sM - iM;
      return { r, lift: lift / 1000, liftRaw: lift };
    });
  }, [gyroidFill, internalPressure, shellT, altitude]);

  const breakeven = chartData.find(d => d.liftRaw > 0)?.r;

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0c0f",
      fontFamily: "'Courier New', monospace",
      padding: "0",
      color: "#ccc"
    }}>
      <div style={{ padding: "8px 32px", background: "rgba(255,180,0,0.06)", borderBottom: "1px solid rgba(255,180,0,0.15)", fontSize: 11, color: "#776a40", textAlign: "center", fontFamily: "monospace" }}>
        This entire thing was generated from one silly prompt to an AI. The math is almost certainly wrong. Do not build an airship based on this.
      </div>

      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg, #0d1117 0%, #0a0c0f 100%)",
        borderBottom: "1px solid rgba(0,255,180,0.15)",
        padding: "24px 32px 20px",
      }}>
        <div style={{ fontSize: 10, color: "#00ffb4", letterSpacing: "0.2em", marginBottom: 6 }}>
          VACUUM AIRSHIP FEASIBILITY CALCULATOR
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>
          GYROID CFRP VACUUM SPHERE
        </div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
          /theydidthemath · partial vacuum buoyancy · structural sizing
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 0, minHeight: "calc(100vh - 80px)" }}>
        {/* Controls */}
        <div style={{
          borderRight: "1px solid rgba(255,255,255,0.06)",
          padding: "24px 24px",
          display: "flex", flexDirection: "column", gap: 20
        }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.15em", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}>
            STRUCTURE PARAMETERS
          </div>

          <Slider label="Sphere Radius" min={1} max={200} step={1} value={radius} onChange={setRadius}
            format={v => `${v} m`} />
          <Slider label="Shell Thickness" min={0.1} max={30} step={0.1} value={shellThicknessCm} onChange={setShellThicknessCm}
            format={v => `${v} cm`} />
          <Slider label="Gyroid Infill Density" min={2} max={50} step={1} value={gyroidFill} onChange={setGyroidFill}
            format={v => `${v}%`} />
          <Slider label="Internal Pressure" min={0} max={95} step={1} value={internalPressure} onChange={setInternalPressure}
            format={v => `${v}% atm`} />
          <Slider label="Target Altitude" min={0} max={10000} step={100} value={altitude} onChange={setAltitude}
            format={v => `${(v * 3.28084 / 1000).toFixed(1)}k ft / ${(v/1000).toFixed(1)}km`} />

          <div style={{ marginTop: 8, padding: "12px", background: "rgba(0,255,180,0.04)", border: "1px solid rgba(0,255,180,0.1)", borderRadius: 6, fontSize: 10, color: "#666", lineHeight: 1.8 }}>
            <div style={{ color: "#00ffb4", marginBottom: 4 }}>MATERIAL: CFRP (CARBON FIBER REINFORCED POLYMER)</div>
            Bulk density: 1,600 kg/m³ · E ≈ 150–300 GPa<br />
            Effective at {gyroidFill}% fill: <span style={{ color: "#ccc" }}>{(matDensity * gyroidFill / 100).toFixed(0)} kg/m³</span><br />
            Air @ altitude: <span style={{ color: "#ccc" }}>{rho_air.toFixed(3)} kg/m³</span>
          </div>
        </div>

        {/* Results */}
        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Status Banner */}
          <div style={{
            padding: "14px 20px",
            background: feasible ? "rgba(0,255,180,0.06)" : "rgba(255,80,80,0.06)",
            border: `1px solid ${feasible ? "rgba(0,255,180,0.25)" : "rgba(255,80,80,0.25)"}`,
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: feasible ? "#00ffb4" : "#ff6060", letterSpacing: "0.1em" }}>
                {feasible ? "▲ POSITIVE LIFT — AIRWORTHY" : "▼ NEGATIVE LIFT — SINKS"}
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                Neutral buoyancy shell thickness at these settings: {neutralThicknessCm.toFixed(2)} cm
                {shellThicknessCm <= neutralThicknessCm ? " — your shell is within budget" : " — your shell is too heavy"}
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: feasible ? "#00ffb4" : "#ff6060", fontFamily: "monospace" }}>
              {netLiftTonnes > 0 ? "+" : ""}{formatNum(netLiftTonnes, 1)} t
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Stat label="Sphere Radius" value={radius} unit="m" />
            <Stat label="Volume" value={formatNum(V_total)} unit="m³" />
            <Stat label="Surface Area" value={formatNum(A_surface)} unit="m²" />
            <Stat label="Shell Mass" value={formatNum(shellMass)} unit="kg" warn={shellMass > displacedAirMass * 0.8} />
            <Stat label="Displaced Air" value={formatNum(displacedAirMass)} unit="kg" />
            <Stat label="Net Payload Lift" value={formatNum(netLiftKg)} unit="kg" highlight={feasible} warn={!feasible} />
          </div>

          {/* Chart */}
          <div>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.15em", marginBottom: 12 }}>
              NET LIFT vs RADIUS — current shell/fill/pressure settings
              {breakeven ? <span style={{ color: "#00ffb4", marginLeft: 12 }}>↑ BREAKEVEN AT r={breakeven}m</span> : <span style={{ color: "#ff6060", marginLeft: 12 }}>NO BREAKEVEN IN RANGE</span>}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="r" stroke="#444" tick={{ fill: "#555", fontSize: 10 }} label={{ value: "radius (m)", fill: "#555", fontSize: 10, position: "insideBottom", offset: -2 }} />
                <YAxis stroke="#444" tick={{ fill: "#555", fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}t`} />
                <Tooltip
                  contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 4, fontSize: 11 }}
                  formatter={(v) => [`${Number(v).toFixed(1)} tonnes`, "Net Lift"]}
                  labelFormatter={(v) => `r = ${v}m`}
                />
                <ReferenceLine y={0} stroke="rgba(0,255,180,0.4)" strokeDasharray="6 3" />
                <Line type="monotone" dataKey="lift" stroke="#00ffb4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Notes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 10, color: "#555", lineHeight: 1.7 }}>
            <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ color: "#777", marginBottom: 4 }}>WHY GYROID?</div>
              Gyroid infill is triply periodic minimal surface — equal stiffness in all axes. Ideal for omni-directional pressure loads like atmospheric crush. Outperforms cubic/honeycomb for isotropic compression.
            </div>
            <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ color: "#777", marginBottom: 4 }}>BUOYANCY CONTROL</div>
              Partial vacuum (vs full) reduces shell stress and allows active altitude control — pump air in to descend, pump out to ascend. Internal pressure % directly trades structural load against lift.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
