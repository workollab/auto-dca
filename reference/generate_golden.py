"""
Generate golden-output fixtures from Equinor's reference `dca` package.

These fixtures are the oracle for the TypeScript engine's parity tests. We fit with an
explicit, reproducible configuration (p=1.4, no prior, no time-decay weights) so the TS
engine — implementing the same loss — must reach the same minimum.

Output: auto-dca/engine/test/golden/*.json  and  auto-dca/app/public/samples/*.json
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
REPO = HERE / "decline-curve-analysis"
sys.path.insert(0, str(REPO))

from scipy.optimize import minimize  # noqa: E402
from dca.decline_curve_analysis import Arps, Exponential, CurveLoss  # noqa: E402

GOLDEN_DIR = HERE.parent / "engine" / "test" / "golden"
SAMPLES_DIR = HERE.parent / "app" / "public" / "samples"
GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
SAMPLES_DIR.mkdir(parents=True, exist_ok=True)

P = 1.4  # robust p-norm, Equinor default
GRID = np.linspace(0.0, 60.0, 25)  # dense grid for curve parity (months)


def fit_arps(t, y):
    """Fit log-Arps with p-norm loss, no prior, no weights. Returns dict."""
    def log_arps(t, a, b, c):
        return Arps(a, b, c).eval_log(t)
    loss = CurveLoss(curve_func=log_arps, p=P)
    x0 = np.array([np.log(max(y.sum(), 1e-9)), 1.0, 0.0])
    # Nelder-Mead is robust for the non-smooth p=1.4 loss; restart from BFGS point
    res = minimize(loss, x0=x0, method="Nelder-Mead",
                   args=(t, np.log(y)),
                   options={"xatol": 1e-10, "fatol": 1e-12, "maxiter": 20000})
    fit = Arps(*res.x)
    q1, h, D = fit.original_parametrization()
    return {
        "model": "hyperbolic",
        "thetas": [float(v) for v in res.x],
        "params": {"qi": q1, "b": h, "Di": D},
        "loss": float(res.fun),
        "eur_inf": float(np.exp(fit.theta1)),
        "mu_grid": [float(v) for v in fit.eval(GRID)],
    }


def fit_exponential(t, y):
    def log_exp(t, a, b):
        return Exponential(a, b).eval_log(t)
    loss = CurveLoss(curve_func=log_exp, p=P)
    x0 = np.array([np.log(max(y.sum(), 1e-9)), 1.0])
    res = minimize(loss, x0=x0, method="Nelder-Mead",
                   args=(t, np.log(y)),
                   options={"xatol": 1e-10, "fatol": 1e-12, "maxiter": 20000})
    fit = Exponential(*res.x)
    C, k = fit.original_parametrization()
    return {
        "model": "exponential",
        "thetas": [float(v) for v in res.x],
        "params": {"qi": C, "Di": k},
        "loss": float(res.fun),
        "eur_inf": float(np.exp(fit.theta1)),
        "mu_grid": [float(v) for v in fit.eval(GRID)],
    }


def make_synthetic():
    """Synthetic cases with known ground-truth parameters + reproducible lognormal noise."""
    cases = []
    rng = np.random.default_rng(42)
    t = np.arange(0, 48, dtype=float)

    specs = [
        ("syn_hyperbolic_b05", dict(q_1=1000.0, h=0.5, D=0.08), 0.05),
        ("syn_hyperbolic_b08", dict(q_1=2500.0, h=0.8, D=0.12), 0.07),
        ("syn_steep_b03",      dict(q_1=500.0,  h=0.3, D=0.20), 0.04),
    ]
    for name, params, noise in specs:
        truth = Arps.from_original_parametrization(**params)
        clean = truth.eval(t)
        y = clean * np.exp(rng.normal(0.0, noise, size=t.shape))
        cases.append({
            "name": name,
            "t": [float(v) for v in t],
            "y": [float(v) for v in y],
            "truth": {"qi": params["q_1"], "b": params["h"], "Di": params["D"]},
            "fit_hyperbolic": fit_arps(t, y),
            "fit_exponential": fit_exponential(t, y),
        })

    # A clean exponential case
    truth = Exponential.from_original_parametrization(C=800.0, k=0.05)
    y = truth.eval(t) * np.exp(rng.normal(0.0, 0.03, size=t.shape))
    cases.append({
        "name": "syn_exponential",
        "t": [float(v) for v in t],
        "y": [float(v) for v in y],
        "truth": {"qi": 800.0, "Di": 0.05},
        "fit_hyperbolic": fit_arps(t, y),
        "fit_exponential": fit_exponential(t, y),
    })
    return cases


# Curated SODIR fields: clear single-phase oil decliners that make good demo wells.
SODIR_FIELDS = ["GULLFAKS", "STATFJORD", "OSEBERG", "DRAUGEN", "GYDA", "VARG"]


def load_sodir_wells():
    """Load monthly oil production for curated fields, from production peak onward."""
    csv = REPO / "dca" / "datasets" / "field_production_monthly.csv"
    df = pd.read_csv(csv)
    fieldcol = df.columns[0]  # has a BOM prefix
    wells = []
    for field in SODIR_FIELDS:
        sub = df[df[fieldcol] == field].copy()
        if sub.empty:
            print(f"  ! {field} not found, skipping")
            continue
        sub = sub.sort_values(["prfYear", "prfMonth"]).reset_index(drop=True)
        oil = sub["prfPrdOilNetMillSm3"].to_numpy(dtype=float)
        # Trim leading zeros / ramp-up: start at peak month, decline thereafter
        if oil.max() <= 0:
            continue
        peak = int(np.argmax(oil))
        oil = oil[peak:]
        mask = oil > 0
        oil = oil[mask]
        if len(oil) < 12:
            continue
        t = np.arange(len(oil), dtype=float)
        dates = [f"{int(r.prfYear)}-{int(r.prfMonth):02d}"
                 for r in sub.iloc[peak:].itertuples()]
        dates = [d for d, m in zip(dates, mask) if m]
        wells.append({"field": field, "t": t, "oil": oil, "dates": dates})
    return wells


def main():
    print("Generating synthetic golden cases...")
    synthetic = make_synthetic()
    (GOLDEN_DIR / "synthetic.json").write_text(json.dumps(synthetic, indent=2))
    print(f"  wrote {len(synthetic)} synthetic cases")

    print("Fitting SODIR wells...")
    wells = load_sodir_wells()
    golden_wells = []
    samples = []
    for w in wells:
        t, oil = w["t"], w["oil"]
        fh = fit_arps(t, oil)
        fe = fit_exponential(t, oil)
        golden_wells.append({
            "name": w["field"],
            "t": [float(v) for v in t],
            "y": [float(v) for v in oil],
            "fit_hyperbolic": fh,
            "fit_exponential": fe,
        })
        # Bundle as a demo sample (raw series only; engine fits in-browser)
        samples.append({
            "name": w["field"],
            "label": f"{w['field']} field (NCS)",
            "unit": "MSm³/month oil",
            "source": "SODIR — Norwegian Offshore Directorate (NLOD)",
            "t_unit": "months from peak",
            "points": [{"t": float(tt), "date": d, "q": float(q)}
                       for tt, d, q in zip(t, w["dates"], oil)],
        })
        print(f"  {w['field']:10s} n={len(t):3d}  "
              f"hyp b={fh['params']['b']:.3f} Di={fh['params']['Di']:.4f}  "
              f"loss_hyp={fh['loss']:.4f} loss_exp={fe['loss']:.4f}")

    (GOLDEN_DIR / "sodir_wells.json").write_text(json.dumps(golden_wells, indent=2))
    (SAMPLES_DIR / "wells.json").write_text(json.dumps(samples, indent=2))
    print(f"  wrote {len(golden_wells)} SODIR golden wells + samples")

    # Record the fitting config so the TS side uses identical settings
    (GOLDEN_DIR / "config.json").write_text(json.dumps({
        "p": P, "prior": None, "half_life": None,
        "grid": [float(v) for v in GRID],
        "space": "log", "tolerances": {"loss_rel": 1e-6, "param_rel": 1e-3, "mu_rel": 1e-4},
    }, indent=2))
    print("Done.")


if __name__ == "__main__":
    main()
