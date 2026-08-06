# Fleet Policies (G2)

In-memory Control Plane policies (process-local). Not a new queue.

## Modes

| Mode | Behavior |
|------|----------|
| `spread` | Prefer idle machines (anti-hotspot) |
| `pack` | Prefer already-busy machines (energy / density) |
| `affinity` | Boost sticky agent/host matches |
| `energy_saving` | Prefer machines already running work |
| `manual_pin` | Pin mission/source/browser to a machine |
| `maintenance` | Skip machine entirely |
| `drain` | No new claims; finish in-flight then offline |

## Commands

```
/fleet policy spread
/fleet drain LINH-PC
/fleet drain LINH-PC off
/fleet maintenance worker-B
/fleet planner
```

## Pinning

`pinToMachine({ machineId, sourceId?, missionId?, browserProfile? })`  
Jobs with matching source/mission get affinity boost on that machine.
