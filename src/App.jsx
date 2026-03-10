import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from "recharts";

const CFRP_BULK = 1600; // kg/m3, mid-range aerospace CFRP
const CFRP_E = 70e9; // Pa, quasi-isotropic laminate (~50-70 GPa typical)
const CFRP_NU = 0.3; // Poisson's ratio
const P_ATM_SEA = 101325; // Pa, sea-level atmospheric pressure

function airDensityAtAltitude(alt_m) {
  return 1.225 * Math.exp(-alt_m / 8500);
}

function atmPressureAtAltitude(alt_m) {
  return P_ATM_SEA * Math.exp(-alt_m / 8500);
}

function calcSphere(radius, gyroidFill, internalPressureFrac, matDensityOverride, altitude_m, shellT, knockdown) {
  const rho_air = airDensityAtAltitude(altitude_m);
  const rho_inside = rho_air * internalPressureFrac;
  const rhoRel = gyroidFill / 100;
  const effectiveShellDensity = matDensityOverride * rhoRel;

  const V_total = (4 / 3) * Math.PI * radius ** 3;
  const A_surface = 4 * Math.PI * radius ** 2;

  // Neutral buoyancy shell thickness
  const neutralT = ((rho_air - rho_inside) * V_total) / (effectiveShellDensity * A_surface);

  // Gyroid effective E: quadratic scaling with relative density (bending-dominated, governs buckling)
  const E_eff = rhoRel ** 2 * CFRP_E;

  // Zoelly (1915) critical buckling pressure for thin sphere under external pressure
  const P_cr = (2 * E_eff / Math.sqrt(3 * (1 - CFRP_NU ** 2))) * (shellT / radius) ** 2;

  // Design buckling pressure with knockdown for geometric imperfections
  const P_buckle = knockdown * P_cr;

  // Net external pressure the shell must resist
  const P_atm = atmPressureAtAltitude(altitude_m);
  const P_net = P_atm * (1 - internalPressureFrac);

  const bucklingSF = P_net > 0 ? P_buckle / P_net : Infinity;

  return { rho_air, V_total, A_surface, neutralT, effectiveShellDensity, E_eff, P_cr, P_buckle, P_net, bucklingSF, P_atm };
}

function formatNum(n, decimals = 2) {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(decimals) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(decimals) + "k";
  return n.toFixed(decimals);
}

function formatPressure(pa) {
  if (pa >= 1e6) return (pa / 1e6).toFixed(1) + " MPa";
  if (pa >= 1e3) return (pa / 1e3).toFixed(1) + " kPa";
  return pa.toFixed(0) + " Pa";
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
  const [altitude, setAltitude] = useState(3048);
  const [knockdown, setKnockdown] = useState(0.2);

  const matDensity = CFRP_BULK;
  const shellT = shellThicknessCm / 100;

  const result = useMemo(
    () => calcSphere(radius, gyroidFill, internalPressure / 100, matDensity, altitude, shellT, knockdown),
    [radius, gyroidFill, internalPressure, altitude, shellT, knockdown]
  );

  const { rho_air, V_total, A_surface, neutralT, effectiveShellDensity, E_eff, P_cr, P_buckle, P_net, bucklingSF } = result;

  const shellVolume = A_surface * shellT;
  const shellMass = effectiveShellDensity * shellVolume;
  const internalAirMass = rho_air * (internalPressure / 100) * V_total;
  const displacedAirMass = rho_air * V_total;
  const netLiftKg = displacedAirMass - shellMass - internalAirMass;
  const netLiftTonnes = netLiftKg / 1000;
  const neutralThicknessCm = neutralT * 100;

  const hasLift = netLiftKg > 0;
  const survivesBuckling = bucklingSF >= 1.0;
  const feasible = hasLift && survivesBuckling;

  const chartData = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const r = 1 + i * 2;
      const res = calcSphere(r, gyroidFill, internalPressure / 100, matDensity, altitude, shellT, knockdown);
      const sM = res.effectiveShellDensity * res.A_surface * shellT;
      const iM = res.rho_air * (internalPressure / 100) * res.V_total;
      const lift = res.rho_air * res.V_total - sM - iM;
      return {
        r,
        lift: lift / 1000,
        liftRaw: lift,
        sf: Math.min(res.bucklingSF, 10),
      };
    });
  }, [gyroidFill, internalPressure, shellT, altitude, knockdown]);

  const breakeven = chartData.find(d => d.liftRaw > 0)?.r;

  let statusLabel, statusColor;
  if (feasible) {
    statusLabel = "▲ POSITIVE LIFT + STRUCTURALLY SOUND";
    statusColor = "#00ffb4";
  } else if (hasLift && !survivesBuckling) {
    statusLabel = "▼ FLOATS BUT BUCKLES — SHELL COLLAPSES";
    statusColor = "#ff6060";
  } else if (!hasLift && survivesBuckling) {
    statusLabel = "▼ STRONG BUT TOO HEAVY — SINKS";
    statusColor = "#ff6060";
  } else {
    statusLabel = "▼ TOO HEAVY AND BUCKLES";
    statusColor = "#ff6060";
  }

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
          /theydidthemath · partial vacuum buoyancy · Zoelly buckling · structural sizing
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

          <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.15em", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8, marginTop: 4 }}>
            BUCKLING MODEL
          </div>

          <Slider label="Knockdown Factor" min={0.1} max={0.8} step={0.05} value={knockdown} onChange={setKnockdown}
            format={v => `${v.toFixed(2)} (${v <= 0.2 ? "conservative" : v <= 0.5 ? "moderate" : "optimistic"})`} />

          <div style={{ marginTop: 8, padding: "12px", background: "rgba(0,255,180,0.04)", border: "1px solid rgba(0,255,180,0.1)", borderRadius: 6, fontSize: 10, color: "#666", lineHeight: 1.8 }}>
            <div style={{ color: "#00ffb4", marginBottom: 4 }}>MATERIAL: CFRP (CARBON FIBER REINFORCED POLYMER)</div>
            Bulk density: 1,600 kg/m³<br />
            E = 70 GPa (quasi-isotropic laminate) · ν = 0.3<br />
            Effective at {gyroidFill}% fill: <span style={{ color: "#ccc" }}>{(matDensity * gyroidFill / 100).toFixed(0)} kg/m³</span><br />
            Gyroid E_eff (ρ² scaling): <span style={{ color: "#ccc" }}>{(E_eff / 1e9).toFixed(2)} GPa</span><br />
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
              <div style={{ fontSize: 12, fontWeight: 700, color: statusColor, letterSpacing: "0.1em" }}>
                {statusLabel}
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                Neutral buoyancy shell: {neutralThicknessCm.toFixed(2)} cm
                {shellThicknessCm <= neutralThicknessCm ? " — within budget" : " — too heavy"}
                {" · "}Buckling SF: {bucklingSF < 100 ? bucklingSF.toFixed(3) : "∞"}
                {survivesBuckling ? " — survives" : " — collapses"}
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: statusColor, fontFamily: "monospace" }}>
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
            <Stat label="Net Payload Lift" value={formatNum(netLiftKg)} unit="kg" highlight={hasLift} warn={!hasLift} />
          </div>

          {/* Buckling Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Stat label="Net External P" value={formatPressure(P_net)} unit="" warn={P_net > P_buckle} />
            <Stat label="Design P_buckle" value={formatPressure(P_buckle)} unit={`(${formatPressure(P_cr)} × ${knockdown})`}
              warn={P_buckle < P_net} highlight={P_buckle >= P_net} />
            <Stat label="Buckling SF" value={bucklingSF < 100 ? bucklingSF.toFixed(3) : "∞"} unit="≥ 1.0 req"
              highlight={bucklingSF >= 1.5} warn={bucklingSF < 1.0} />
          </div>

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.15em", marginBottom: 12 }}>
                NET LIFT vs RADIUS
                {breakeven ? <span style={{ color: "#00ffb4", marginLeft: 8 }}>↑ LIFT AT r={breakeven}m</span> : <span style={{ color: "#ff6060", marginLeft: 8 }}>NO LIFT IN RANGE</span>}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="r" stroke="#444" tick={{ fill: "#555", fontSize: 10 }} label={{ value: "radius (m)", fill: "#555", fontSize: 10, position: "insideBottom", offset: -2 }} />
                  <YAxis stroke="#444" tick={{ fill: "#555", fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}t`} />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 4, fontSize: 11 }}
                    formatter={(v, name) => [name === "lift" ? `${Number(v).toFixed(1)} tonnes` : Number(v).toFixed(3), name === "lift" ? "Net Lift" : "Buckling SF"]}
                    labelFormatter={(v) => `r = ${v}m`}
                  />
                  <ReferenceLine y={0} stroke="rgba(0,255,180,0.4)" strokeDasharray="6 3" />
                  <Line type="monotone" dataKey="lift" stroke="#00ffb4" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.15em", marginBottom: 12 }}>
                BUCKLING SAFETY FACTOR vs RADIUS
                <span style={{ color: "#666", marginLeft: 8 }}>SF ≥ 1.0 = survives</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="r" stroke="#444" tick={{ fill: "#555", fontSize: 10 }} label={{ value: "radius (m)", fill: "#555", fontSize: 10, position: "insideBottom", offset: -2 }} />
                  <YAxis stroke="#444" tick={{ fill: "#555", fontSize: 10 }} domain={[0, 'auto']} tickFormatter={v => v.toFixed(1)} />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 4, fontSize: 11 }}
                    formatter={(v) => [Number(v).toFixed(3), "Buckling SF"]}
                    labelFormatter={(v) => `r = ${v}m`}
                  />
                  <ReferenceLine y={1} stroke="rgba(255,180,0,0.6)" strokeDasharray="6 3" label={{ value: "SF=1", fill: "#776a40", fontSize: 9 }} />
                  <Line type="monotone" dataKey="sf" stroke="#ff6060" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Notes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 10, color: "#555", lineHeight: 1.7 }}>
            <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ color: "#777", marginBottom: 4 }}>THE CORE PROBLEM: E/ρ²</div>
              For a vacuum sphere to both float and resist buckling, the shell material needs E/ρ² ≥ ~630,000 Pa·m⁶/kg².
              Even theoretical graphene (E=1 TPa, ρ=2200) only reaches ~207,000 — about 3× short before knockdown.
              With realistic imperfection knockdown (0.2), you need ~15× better than graphene. No known material qualifies.
              <br /><br />
              <span style={{ color: "#666" }}>
                CFRP: 27k · Beryllium: 84k · Diamond: 97k · Graphene: 207k · <span style={{ color: "#ff6060" }}>Need: 630k+</span>
              </span>
            </div>
            <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ color: "#777", marginBottom: 4 }}>WHY BUCKLING KILLS IT</div>
              Zoelly (1915): P_cr = 2E/√(3(1-ν²)) × (t/R)². Buckling resistance scales with (t/R)² — but
              making the shell thicker to survive pressure makes it too heavy to float. Real shells buckle at
              20-70% of theoretical values due to geometric imperfections (NASA SP-8032), making the margin even worse.
              Volume scales as r³ but surface as r² — bigger spheres lift more per unit shell, but the buckling
              ratio (t/R) gets worse.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 10, color: "#555", lineHeight: 1.7 }}>
            <div style={{ padding: "10px 14px", background: "rgba(0,255,180,0.03)", borderRadius: 6, border: "1px solid rgba(0,255,180,0.08)" }}>
              <div style={{ color: "#00ffb4", marginBottom: 4 }}>PATH FORWARD: SANDWICH STRUCTURES</div>
              The Zoelly formula assumes a homogeneous shell. Sandwich construction — two thin face sheets separated by a
              lightweight core — has bending stiffness proportional to the <em>square</em> of the face sheet separation,
              completely changing the scaling. MIT/NASA (2019) showed that discrete lattice structures make the
              problem "strength-limited rather than stability-limited," dodging buckling entirely.
              A gyroid core between CFRP face sheets is actually the right intuition.
            </div>
            <div style={{ padding: "10px 14px", background: "rgba(0,255,180,0.03)", borderRadius: 6, border: "1px solid rgba(0,255,180,0.08)" }}>
              <div style={{ color: "#00ffb4", marginBottom: 4 }}>THE REAL BOTTLENECK: MANUFACTURING</div>
              The physics works. The materials exist. What doesn't exist is the ability to 3D-print a 50m diameter
              geodesic sandwich sphere with sub-millimeter precision. The knockdown factor (0.2 → 0.7) is entirely
              about manufacturing quality — a perfect shell needs ~3× less material than a sloppy one. Advances in
              large-format composite additive manufacturing and automated fiber placement are slowly closing this gap.
              The problem is fabrication, not physics.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
