# Historical milestone 2 review

The subsequent all-milestone release supersedes the pending-work notes below; see
`GAMES.md` and `CONTRACT.md` for the implemented 3D module and current protocols.

# Milestone 2 review

Complete: deterministic country plazas/wilderness fallback, instanced kiosks, ground projection,
street and plot clearance, signs within 150 m, two-second occupancy, weekly best, five-metre
join prompt, station client, lobby/overlay, Escape/Leave and walking-ref restoration. The only
WatchSphere edits are its StationLayer import, mount and controls hint. Other world edits are
owned by the teammate and are not part of this commit.

Hand test: open `/src/stations/preview.html` on the running Vite server. Join a game, start
practice or join from another tab, then Escape/Leave. For world placement, enter a planet,
walk to a coloured kiosk and press E. Watch for sign clipping, street/building overlaps,
occupancy updates and held movement keys after leaving.

The engine views in this folder are preserved prototypes from work before the 3D amendment.
They use flat boards; `space: '3d'` labels the intended replacement, not a delivered 3D game.
Section 5.8 requires the shared world3d physics/collision/level module, vertical state,
sequenced input, prediction/reconciliation, 15 Hz snapshots and first/third-person cameras.
These belong to the revised Arena/Track/Siege milestones and have not been started here.

Catalogue migration now complete: exactly nine 3D games, one per planet; seven third-person,
Lights Out/Rail Rush first-person; 45 2D games with topdown/UI views. The explicit user update
includes `ui` in the type even though the markdown example union omitted it.
