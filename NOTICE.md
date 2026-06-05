# Attribution & Third-Party Notices

Auto DCA is © 2026 Workollab LLC, released under the MIT License (see `LICENSE`).

## Equinor `decline-curve-analysis`

The Auto DCA engine is an independent, from-scratch reimplementation derived from the
mathematics and design of Equinor's open-source project:

- **Project:** https://github.com/equinor/decline-curve-analysis
- **License:** MIT, Copyright (c) 2025 Equinor
- A vendored copy is kept under `reference/decline-curve-analysis/` solely as a numerical
  reference (oracle) for parity testing. Its original `LICENCE.md` is preserved.

The reparametrization of the Arps curve used internally follows the approach in:
Se Yoon Lee et al., "Bayesian Hierarchical Modeling" (Generalized Pareto parametrization).

## SODIR sample data

Bundled sample wells (`app/public/samples/wells.json`) are derived from monthly field
production published by **SODIR — the Norwegian Offshore Directorate**:

- **Source:** https://factpages.sodir.no/en/field/TableView/Production/Saleable/Monthly
- **License:** Norwegian Licence for Open Government Data (NLOD) —
  https://data.norge.no/nlod/en

Only a curated subset of fields, trimmed from production peak, is included for demonstration.
