/**
 * Builds /public/models from the CC0 source packs (KayKit by Kay Lousberg, Kenney).
 *   node scripts/prepare-assets.mjs <path-to-source-packs>
 * - character GLBs: meshes + skeleton only (animations stripped)
 * - anims.glb: one shared animation library (all KayKit characters share the same rig)
 * - city props / cars: converted from .gltf+.bin to single .glb files
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import fs from 'node:fs';

/** Fully remove an animation incl. its samplers and keyframe accessors */
function killAnim(a) {
  for (const s of a.listSamplers()) { const i = s.getInput(), o = s.getOutput(); s.dispose(); if (i && i.listParents().length <= 1) i.dispose(); if (o && o.listParents().length <= 1) o.dispose(); }
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}
import path from 'node:path';

const SRC = process.argv[2] ?? '/tmp/claude-0/assets';
const OUT = path.resolve('public/models');
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const adv = `${SRC}/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf`;
const skel = `${SRC}/KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons/Characters/gltf`;
const city = `${SRC}/KayKit-City-Builder-Bits-1.0/addons/kaykit_city_builder_bits/Assets/gltf`;

const KEEP = new Set(['Idle', 'Unarmed_Idle', 'Walking_A', 'Walking_B', 'Walking_C', 'Running_A', 'Running_B', 'Death_A', 'Death_B',
  'Hit_A', 'Hit_B', 'Unarmed_Melee_Attack_Punch_A', '2H_Melee_Attack_Chop', '1H_Ranged_Aiming', '1H_Ranged_Shooting', '2H_Ranged_Aiming',
  '2H_Ranged_Shooting', 'Throw', 'Spellcast_Shoot', 'Interact', 'Cheer', 'Sit_Chair_Idle', 'Lie_Idle', 'Skeletons_Awaken_Floor', 'Use_Item']);

async function write(doc, name) {
  // drop accessors orphaned by removed animations (prune() keeps root-only accessors)
  for (const a of doc.getRoot().listAccessors()) if (a.listParents().every((p) => p.propertyType === 'Root')) a.dispose();
  await doc.transform(dedup(), prune());
  await io.write(path.join(OUT, name), doc);
  console.log(name, (fs.statSync(path.join(OUT, name)).size / 1024).toFixed(0) + ' KB');
}

// 1) shared animation library (from two sources so we get both human + skeleton clips)
{
  const doc = await io.read(`${adv}/Rogue_Hooded.glb`);
  const extra = await io.read(`${skel}/Skeleton_Minion.glb`);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!KEEP.has(a.getName())) killAnim(a);
  // copy the skeleton-only clip by retargeting its channels onto same-named nodes
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  for (const src of extra.getRoot().listAnimations()) {
    if (src.getName() !== 'Skeletons_Awaken_Floor') continue;
    const dst = doc.createAnimation(src.getName());
    const buf = root.listBuffers()[0];
    for (const ch of src.listChannels()) {
      const node = byName.get(ch.getTargetNode()?.getName());
      if (!node) continue;
      const s = ch.getSampler();
      const inp = doc.createAccessor().setType(s.getInput().getType()).setArray(s.getInput().getArray().slice()).setBuffer(buf);
      const out = doc.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buf);
      const ns = doc.createAnimationSampler().setInput(inp).setOutput(out).setInterpolation(s.getInterpolation());
      dst.addSampler(ns).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(ns));
    }
  }
  // the library needs no visible meshes
  for (const n of root.listNodes()) if (n.getMesh()) { n.setMesh(null); n.setSkin(null); }
  await write(doc, 'anims.glb');
}

// 2) characters without animations
for (const [file, out] of [[`${adv}/Rogue_Hooded.glb`, 'player.glb'], [`${adv}/Barbarian.glb`, 'z_barbarian.glb'], [`${adv}/Knight.glb`, 'z_knight.glb'],
  [`${adv}/Rogue.glb`, 'z_rogue.glb'], [`${adv}/Mage.glb`, 'z_mage.glb'], [`${skel}/Skeleton_Warrior.glb`, 'z_warrior.glb'], [`${skel}/Skeleton_Minion.glb`, 'z_minion.glb']]) {
  const doc = await io.read(file);
  for (const a of doc.getRoot().listAnimations()) killAnim(a);
  await write(doc, out);
}

// 3) city props, buildings and cars
for (const n of ['car_taxi', 'car_police', 'car_sedan', 'car_hatchback', 'car_stationwagon', 'streetlight', 'trafficlight_A', 'firehydrant', 'dumpster',
  'trash_A', 'trash_B', 'bench', 'box_A', 'box_B', 'bush', 'watertower', 'building_A_withoutBase', 'building_B_withoutBase', 'building_C_withoutBase',
  'building_D_withoutBase', 'building_E_withoutBase', 'building_F_withoutBase', 'building_G_withoutBase', 'building_H_withoutBase']) {
  const doc = await io.read(`${city}/${n}.gltf`);
  await write(doc, `${n.replace('_withoutBase', '')}.glb`);
}

// 4) Kenney motorcycle
await write(await io.read(`${SRC}/Starter-Kit-Racing/models/vehicle-motorcycle.glb`), 'motorcycle.glb');
