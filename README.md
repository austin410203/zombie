# Outbreak: NYC 2026

A top-down / third-person **zombie shooter** set in Manhattan on day one of a 2026 outbreak.
Built with **Three.js + TypeScript + Vite**, deployable to **Vercel**. English / 繁體中文.

Reuses the engine pieces of *AI Detective* (character rig, collision, camera, input, audio, i18n).

## Features
- **7 story missions**: reach the precinct armory, clear Times Square, recover patient-zero samples, drive them to the CDC field lab, rescue survivors, defend the Empire relay, kill the Abomination and catch the last chopper out of Central Park.
- **18 weapons** — 11 firearms (M1911, .44 Magnum, Uzi, MP5, pump shotgun, AA-12, AK-47, M4, Barrett .50, M134 Minigun, flamethrower) and 6 heavy weapons / cannons (M79, RPG-7, homing missile launcher, hand cannon, cluster mortar, XR-9 railgun), plus a baseball bat. Found in weapon crates around the map or earned from missions; pick any time from the **Arsenal** (Tab).
- **8 vehicles**: yellow cab, NYPD cruiser, pickup, ambulance, armored SUV, sports car, motorcycle, dirt bike. Run zombies over; vehicles take damage and explode. You can fire sidearms from a bike.
- **Items**: medkits (stored), bandages, armor, ammo boxes, grenades, adrenaline (speed), berserk serum (double damage), toolkits (repair vehicles), mission sample cases.
- **5 zombie types**: walker, runner, brute, acid spitter, and the Abomination boss.
- Minimap, objective arrow, radio transmissions, checkpoint saves (localStorage).

## Graphics
- CC0 3D models: KayKit city buildings, cars, street props and animated characters (zombies use one shared animation library); Kenney motorcycle. See `CREDITS.md`.
- Procedural PBR materials (albedo / normal / roughness / metalness / emissive) for asphalt, sidewalks, façades, grass and roofs.
- Image-based lighting from a night-city HDRI.
- Post-processing: GTAO ambient occlusion, bloom, depth of field, colour grading (split-toning, vignette, grain, chromatic aberration).
- Quality presets **HQ / MQ / LQ** (button or **V**); phones default to MQ and quality drops automatically if FPS is low.

## Controls
| Desktop | Mobile | |
|---|---|---|
| WASD (Shift sprint) | Left stick | Move / drive |
| Mouse + left click | Right stick (auto-fire, aim assist) | Aim & shoot |
| R | RELOAD | Reload |
| 1–9 / Q E / Tab | WEAPON | Switch weapon / Arsenal |
| G | ● G | Throw grenade |
| H | ✚ H | Use medkit |
| F (hold to rescue) | F | Enter / exit vehicle, rescue |
| Space | – | Handbrake / horn |
| Scroll / + − | – | Zoom |
| L / M / Esc | buttons | Language / mute / pause |

## Run
```bash
npm install
npm run dev
npm run build
```
Deploy: import the repo in Vercel (framework preset **Vite**, output `dist`).
