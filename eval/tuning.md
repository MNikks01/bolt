# Tuning (dev split, 30 tasks; objective: mean full recall over 8k/16k/32k)

| Config | Full recall (mean) | 8k | 16k | 32k |
|---|---|---|---|---|
| graph a=0.85 h=0 | 68.7% | 61% | 68% | 78% |
| bm25 | 68.2% | 57% | 70% | 78% |
| graph a=0.95 h=0.5 | 68.2% | 57% | 70% | 78% |
| graph a=0.95 h=1 | 68.2% | 57% | 70% | 78% |
| graph a=0.85 h=0.5 | 68.0% | 57% | 68% | 79% |
| graph a=0.85 h=1 | 67.6% | 57% | 68% | 78% |
| graph a=0.95 h=0 | 67.6% | 57% | 68% | 78% |
| graph a=0.7 h=1 | 66.4% | 55% | 66% | 78% |
| graph a=0.5 h=0.5 | 66.0% | 57% | 64% | 77% |
| graph a=0.7 h=0 | 66.0% | 55% | 67% | 76% |
| graph a=0.5 h=1 | 65.5% | 55% | 64% | 77% |
| graph a=0.7 h=0.5 | 65.3% | 54% | 64% | 78% |
| graph a=0.5 h=0 | 58.5% | 49% | 55% | 72% |

## Signature share (with graph a=0.85 h=0; objective: mean of full and visible recall)

| fullShare | Full | Visible | Objective |
|---|---|---|---|
| 0.6 | 62.3% | 85.4% | 73.8% |
| 0.75 | 65.8% | 80.0% | 72.9% |
| 0.9 | 66.2% | 78.1% | 72.2% |

**Chosen:** graph a=0.85 h=0, fullShare=0.6
