// Het enige deel met PlayCanvas (samen met figuur.mjs, materialen.mjs en vormen.mjs): app, camera, licht en de wereld van een level.
// Render-spec uit de meetproef: WebGL2, geen anti-aliasing, pixel ratio 1, blokken gebundeld,
// geen schaduwen en geen post-processing (Chromebook-budget).
// Het beeld leest de staat van de logica elke frame (werkBij) en verandert zelf niets aan het spel.
// Sap (DEV.md, Sap en geluid): kleine animaties bovenop de echte staat, op de speltijd (met de hulp open staan ze
// stil): knop zakt in, klep valt plat, vlag gaat omhoog, een fout blokje wiebelt, en de tekeningen leven (ademen,
// wiebelen bij het lopen, rekken bij een sprong, pletten bij het landen, ploffen op de vlag). Geen extra draw call.
import * as pc from 'playcanvas';
import { HOOGTE_EENHEID, KOLOMMEN, RIJEN } from '../logica/raster.mjs';
import { HALF, SPRONGSNELHEID } from '../logica/beweging.mjs';
import { LIFT_BEGIN, LIFT_RONDE } from '../logica/entiteiten/lift.mjs';
import { hupFase } from '../logica/vijanden.mjs';
import { BAL_HALF, BUIT_EINDBAAS, MAX_BALLEN } from '../logica/gooien.mjs';
import { laadTextuur, maakFiguur } from './figuur.mjs';
import { EINDBAAS_GROOT } from './maten.mjs'; // alleen de tekening; de botsvorm is voor elke vijand gelijk
import { maakMaterialen, VLOER_NEUTRAAL, VLOERTINT } from './materialen.mjs';
import { kleurVloer, maakSterMesh, maakVloerMesh } from './vormen.mjs';

// Waar de bollen van de buit liggen, ten opzichte van het midden van het vakje (een vierkantje).
const BUIT_PLEK = [[-0.17, -0.17], [0.17, 0.17], [0.17, -0.17], [-0.17, 0.17]];
const MUURHOOGTE = 1;
// s in de ronde: de lift begint te bewegen, het randje licht op (de maat). De lift is stil (loop D): de hartslag in het
// geluid is die van de held.
const LIFT_PULS_OP = [LIFT_BEGIN.op, LIFT_BEGIN.neer];

// Sap-hulpjes: q loopt van 0 tot 1; tussen() klemt, uitBack() schiet iets voorbij en komt terug.
const tussen = (x) => Math.min(1, Math.max(0, x));
const uitBack = (q) => 1 + 2.70158 * (q - 1) ** 3 + 1.70158 * (q - 1) ** 2;
// Verminderde beweging (instelling van de computer): geen ademen, geen wiebel en geen kantelen (ook het foute blokje
// niet); rekken en pletten bij een sprong of landing blijven. Eén MediaQueryList, die de instelling live volgt.
const bewegingMq = matchMedia('(prefers-reduced-motion: reduce)');
const minderBeweging = () => bewegingMq.matches;
const ADEM_HZ = 0.4; // ademen in rust: sy 1 ± ADEM, elke figuur zijn eigen fase
const ADEM = 0.025;
// Fout antwoord: het blokje wiebelt 2 keer ±8° om de hoogte-as, uitdovend in WIEBEL_DUUR s speltijd. q = 0-1.
// Geëxporteerd voor de speeltest: die leest de kromme op de speltijd, niet op toevallige frames.
export const WIEBEL_DUUR = 0.3;
export const wiebelDraai = (q) => 8 * Math.sin(4 * Math.PI * q) * (1 - q);

// De vervorming van één figuur op speltijd `tijd` (alleen beeld; de botsvorm verandert nooit, NN3).
// - Iedereen ademt (sy 1 ± 2,5%), behalve bij verminderde beweging: dan staan ze in rust stil.
// - Held: wiebelt ±5° bij het lopen, met een fase uit de afgelegde weg (stilstaan = recht), plus een deintje; rekt bij
//   het omhoog springen; plet bij het landen (sterker bij een hardere val); ploft op de vlag na geraakt (0 -> 1,1 -> 1).
// - Schurk: plet uit zijn hupfase, vlak voor en na de grond (de eindbaas zwaarder), en een overwinningshopje (kantel
//   ±10°, 2 keer) als hij je raakte.
// Geëxporteerd voor de speeltest (alleen aanroepen met een eigen f): die leest de vorm op speltijd, niet per frame.
export function vormVan(f, tijd, minder) {
  const { sap, van } = f;
  const dt = sap.tijd === null ? 0 : Math.max(0, tijd - sap.tijd);
  sap.tijd = tijd;
  let sx = 1;
  let sy = minder ? 1 : 1 + ADEM * Math.sin(2 * Math.PI * ADEM_HZ * tijd + sap.fase);
  let kantel = 0;
  if (f.rol === 'held') {
    const stap = sap.vorig ? Math.hypot(van.x - sap.vorig[0], van.z - sap.vorig[1]) : 0;
    sap.vorig = [van.x, van.z];
    sap.afgelegd += stap;
    sap.loopt += ((van.opGrond && stap > 1e-4 ? 1 : 0) - sap.loopt) * Math.min(1, dt * 12);
    if (!minder) {
      const golf = Math.sin(Math.PI * sap.afgelegd);
      kantel = 5 * golf * sap.loopt;
      sy *= 1 + 0.03 * Math.abs(golf) * sap.loopt;
    }
    if (!van.opGrond && van.vy > 0) {
      const r = Math.min(1, van.vy / SPRONGSNELHEID);
      sy *= 1 + 0.12 * r;
      sx *= 1 - 0.05 * r;
    }
    if (sap.land) {
      const q = (tijd - sap.land.van) / 0.15;
      if (q >= 1) sap.land = null;
      else {
        const a = sap.land.k * (1 - q);
        sx *= 1 + 0.12 * a;
        sy *= 1 - 0.15 * a;
      }
    }
    if (sap.plop !== null) {
      const q = (tijd - sap.plop) / 0.3;
      if (q >= 1) sap.plop = null;
      else {
        const s = q < 0.6 ? 1.1 * Math.sin((Math.PI / 2) * (q / 0.6)) : 1.1 - (0.1 * (q - 0.6)) / 0.4;
        sx *= s;
        sy *= s;
      }
    }
  } else {
    const h = hupFase(van, tijd);
    const p = Math.max(0, 1 - Math.min(h, 1 - h) / 0.06);
    const k = f.rol === 'eindbaas' ? 0.25 : 0.15;
    sx *= 1 + k * p;
    sy *= 1 - k * p;
    if (sap.hopje !== null) {
      const q = (tijd - sap.hopje) / 0.4;
      if (q >= 1) sap.hopje = null;
      else if (!minder) kantel = 10 * Math.sin(4 * Math.PI * q);
    }
  }
  return { sx, sy, kantel };
}

// Gooit een fout als er geen WebGL2 is; main.mjs toont dan het foutscherm.
export function maakBeeld(canvas) {
  // alpha: het canvas is doorzichtig waar geen bord is, zodat de achtergrondplaat (CSS) erachter te zien is.
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { antialias: false, alpha: true } });
  if (!app.graphicsDevice.isWebGL2) throw new Error('geen WebGL2');
  app.graphicsDevice.maxPixelRatio = 1;
  // Het canvas volgt zijn CSS-maat (het 16:9-podium); PlayCanvas zet elke frame de resolutie daarop.
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(0.5, 0.5, 0.5);

  // Vast, schuin van boven, het hele level in beeld. Het canvas is doorzichtig (clearColor alpha 0): de
  // achtergrondplaat is CSS op het podium (stijl.css), geen WebGL-textuur. Het bord bedekt het lege midden ervan.
  const camera = new pc.Entity('camera');
  camera.addComponent('camera', { fov: 45, nearClip: 0.1, farClip: 100, clearColor: new pc.Color(0, 0, 0, 0) });
  camera.camera.toneMapping = pc.TONEMAP_LINEAR;
  camera.setPosition(KOLOMMEN / 2, 16, 17);
  camera.lookAt(KOLOMMEN / 2, 0, RIJEN / 2);
  app.root.addChild(camera);

  const licht = new pc.Entity('licht');
  licht.addComponent('light', { type: 'directional', color: new pc.Color(1, 1, 1), intensity: 0.85, castShadows: false });
  licht.setRotation(new pc.Quat().setFromDirections(pc.Vec3.DOWN, new pc.Vec3(0.3, -1, -0.5).normalize()));
  app.root.addChild(licht);

  const mat = maakMaterialen(app.graphicsDevice);
  const blokken = app.batcher.addGroup('blokken', false, 32);
  // De vlotten varen: een dynamische batch (de positie per vlot blijft), samen één draw call (hamster: 7 vlotten).
  const vlotten = app.batcher.addGroup('vlotten', true, 32);
  // De sterren ook (loop E): de maagmonsters hebben er 25, elk apart was 54 draw calls (budget 50). Een gepakte ster
  // krijgt schaal 0 (aan- en uitzetten zou de batch elke keer opnieuw laten opbouwen).
  const sterren = app.batcher.addGroup('sterren', true, 32);
  // Ballen en buit (loop E): één dynamische batch, wit en donker = 2 draw calls. Verborgen met schaal 0 midden op het bord:
  // zo tekent de batch vanaf de start (de shader compileert dan, niet bij de eerste worp) en bouwt hij nooit opnieuw op.
  const afweer = app.batcher.addGroup('afweer', true, 32);
  const VERBORGEN = [10, 0.1, 6];
  const sterMesh = maakSterMesh(app.graphicsDevice);
  // De vloer staat los van het level (nooit weggegooid): per level krijgt hij alleen nieuwe kleuren.
  const vloerMesh = maakVloerMesh(app.graphicsDevice);
  const vloer = new pc.Entity('vloer');
  vloer.addComponent('render', { meshInstances: [new pc.MeshInstance(vloerMesh, mat.vloer)] });
  vloer.enabled = false;
  app.root.addChild(vloer);

  let level = null;
  let tekeningen = []; // één per ding: { ding, werkBij(spel), staat() }
  let figuren = []; // { rol: 'held' | 'vijand' | 'eindbaas', figuur, van: held of vijand uit de logica }
  let ballen = []; // witte bloedcellen: een vaste set van MAX_BALLEN, zichtbaar (schaal > 0) zolang de logica een bal heeft
  let buit = []; // per schurk BUIT_EINDBAAS kleine bollen, zichtbaar zoveel als er op zijn vakje liggen

  function doos(ouder, materiaal, type, [sx, sy, sz], [x, y, z], batch = false) {
    const e = new pc.Entity(type);
    e.addComponent('render', { type, material: materiaal });
    if (batch) e.render.batchGroupId = blokken.id;
    e.setLocalScale(sx, sy, sz);
    e.setPosition(x, y, z);
    ouder.addChild(e);
    return e;
  }

  // Per soort ding: wat er staat en hoe het meeverandert. Alleen tekenen wat de logica zegt.
  const tekenaar = {
    klep(d, [x, z]) {
      const poort = doos(level, mat.klep, 'box', [0.9, 1, 0.9], [x, 0.5, z]);
      // Open: de poort ligt plat en een pijl wijst de enige kant op (van → overkant), zoals een hartklep.
      const pijl = doos(level, mat.klep, 'cone', [0.4, 0.55, 0.4], [x, 0.25, z]);
      if (d.overkant) {
        const [dk, dr] = [d.overkant[0] - d.cel[0], d.overkant[1] - d.cel[1]];
        pijl.setEulerAngles(dr * 90, 0, -dk * 90);
      }
      pijl.enabled = false;
      // Open (de logica meteen, het beeld met sap): 150 ms na de knop valt de poort in 0,2 s plat en veert een klein
      // beetje terug (gelijk met het "zwoesj"); de pijl popt op tussen 0,3 en 0,5 s. Plat na ~0,29 s: in het hart-level
      // (knop D3, klep D5) is de held dan nog een half vakje van de klep, dus hij loopt nooit door een staande poort.
      let van = null;
      let klaar = false;
      return {
        werkBij(spel) {
          if (!d.open || klaar) return;
          van ??= spel.tijd;
          const s = spel.tijd - van;
          const q = tussen((s - 0.15) / 0.2);
          const hoog = q < 0.7 ? 1 - 0.94 * (q / 0.7) ** 2 : 0.06 + 0.12 * Math.sin((Math.PI * (q - 0.7)) / 0.3);
          poort.setLocalScale(0.9, hoog, 0.9);
          poort.setPosition(x, hoog / 2, z);
          const p = tussen((s - 0.3) / 0.2);
          const k = p < 0.6 ? (1.2 * p) / 0.6 : 1.2 - (0.2 * (p - 0.6)) / 0.4;
          pijl.enabled = p > 0;
          pijl.setLocalScale(0.4 * k, 0.55 * k, 0.4 * k);
          klaar = q >= 1 && p >= 1;
        },
        // open: plat genoeg (< 0,2), ook tijdens het terugveren (tot 0,18): eenmaal open blijft open.
        // hoogte: hoe hoog de poort nu getekend is (1 = staat, 0,06 = plat), voor de speeltest.
        staat: () => ({ open: pijl.enabled && poort.getLocalScale().y < 0.2, dicht: poort.getLocalScale().y >= 1, hoogte: poort.getLocalScale().y }),
      };
    },
    // Transforms alleen zetten als de staat verandert of een animatie loopt (Chromebook-budget); de ster draait wel
    // elke frame. Ingedrukt: de knop zakt in 80 ms in.
    knop(d, [x, z]) {
      const knop = doos(level, mat.knop, 'cylinder', [0.6, 0.14, 0.6], [x, 0.07, z]);
      let van = null;
      let klaar = false;
      return {
        werkBij(spel) {
          if (!d.ingedrukt || klaar) return;
          van ??= spel.tijd;
          const q = tussen((spel.tijd - van) / 0.08);
          const hoog = 0.14 - 0.1 * q;
          knop.setLocalScale(0.6, hoog, 0.6);
          knop.setPosition(x, hoog / 2, z);
          klaar = q >= 1;
        },
        staat: () => ({ ingedrukt: knop.getLocalScale().y < 0.1 }),
      };
    },
    sleutel(d, [x, z]) {
      const ring = doos(level, mat.knop, 'torus', [0.6, 0.6, 0.6], [x, 0.4, z]);
      ring.setEulerAngles(90, 0, 0);
      return { werkBij() { if (ring.enabled === d.ingedrukt) ring.enabled = !d.ingedrukt; }, staat: () => ({ zichtbaar: ring.enabled }) };
    },
    // Een vijfpuntige ster, schuin naar de camera gekanteld, die zachtjes heen en weer wiegt (nooit op zijn kant).
    ster(d, [x, z]) {
      const ster = new pc.Entity('ster');
      const vorm = new pc.Entity('vorm');
      vorm.addComponent('render', { meshInstances: [new pc.MeshInstance(sterMesh, mat.ster)] });
      vorm.render.batchGroupId = sterren.id;
      vorm.setLocalEulerAngles(-45, 0, 0);
      ster.addChild(vorm);
      ster.setPosition(x, 0.5, z);
      level.addChild(ster);
      const zichtbaar = () => ster.getLocalScale().x > 0;
      return {
        werkBij(spel) {
          if (zichtbaar() === d.gepakt) ster.setLocalScale(d.gepakt ? 0 : 1, d.gepakt ? 0 : 1, d.gepakt ? 0 : 1);
          if (zichtbaar()) ster.setEulerAngles(0, 30 * Math.sin(spel.tijd * 2.5), 0);
        },
        staat: () => ({ zichtbaar: zichtbaar() }),
      };
    },
    // Een lichtgrijze vlag van ongeveer één vakje hoog op een paal; bereikt = de vlag gaat omhoog.
    checkpoint(d, [x, z]) {
      doos(level, mat.paal, 'cylinder', [0.1, 1.3, 0.1], [x - 0.28, 0.65, z]);
      doos(level, mat.vlag, 'sphere', [0.16, 0.16, 0.16], [x - 0.28, 1.34, z]);
      // Iets naar de camera gekanteld (die kijkt steil van boven), anders zie je alleen de bovenrand.
      const vlag = doos(level, mat.vlag, 'box', [0.62, 0.46, 0.04], [x + 0.05, 0.62, z]);
      vlag.setEulerAngles(-40, 0, 0);
      // Bereikt: de vlag gaat in 0,5 s omhoog (schiet iets door) en wappert twee keer.
      let van = null;
      let klaar = false;
      return {
        werkBij(spel) {
          if (!d.bereikt || klaar) return;
          van ??= spel.tijd;
          const q = tussen((spel.tijd - van) / 0.5);
          vlag.setPosition(x + 0.05, 0.62 + 0.42 * uitBack(q), z);
          vlag.setEulerAngles(-40, minderBeweging() ? 0 : 10 * Math.sin(4 * Math.PI * q) * (1 - q), 0);
          klaar = q >= 1;
        },
        staat: () => ({ vlagOmhoog: vlag.getPosition().y > 0.9 }),
      };
    },
    // Wit lijf met een rand er net onder die rondom uitsteekt: van boven zie je het lijf met een ring eromheen.
    lift(d, [x, z]) {
      const lijf = doos(level, mat.lift, 'box', [0.86, 0.06, 0.86], [x, 0.03, z]);
      const rand = doos(level, mat.liftRand, 'box', [1, 0.04, 1], [x, 0.03, z]);
      let was = null;
      return {
        werkBij() {
          const top = Math.max(d.hoogte * HOOGTE_EENHEID, 0.06);
          if (top === was) return;
          was = top;
          lijf.setLocalScale(0.86, top, 0.86);
          lijf.setPosition(x, top / 2, z);
          rand.setPosition(x, top - 0.03, z);
        },
        staat: () => ({ top: lijf.getLocalScale().y }),
      };
    },
    // Een vlot (platform.mjs): een plat wit blok net boven het water, op de plek die de logica zegt. Zonder rand en
    // zonder puls: dat is de lift. Alle vlotten samen in de dynamische batch `vlotten`.
    vlot(d) {
      const blok = doos(level, mat.lift, 'box', [0.92, 0.08, 0.92], [d.x, 0.04, d.z]);
      blok.render.batchGroupId = vlotten.id;
      return {
        werkBij() { blok.setPosition(d.x, 0.04, d.z); },
        staat: () => (({ x, z }) => ({ x, z }))(blok.getPosition()),
      };
    },
    opdracht(d, [x, z]) {
      doos(level, mat.opdracht, 'box', [0.9, 0.1, 0.9], [x, 0.05, z]);
      return { werkBij() {}, staat: () => ({}) };
    },
    // Antwoordblokje: getekend zo breed als waar de voeten van de held erop staan en ertegen botsen (1 + 2 x HALF,
    // beweging.grondOnder), zichtbaar breder dan een held.
    antwoord(d, [x, z]) {
      const hoog = d.hoogte * HOOGTE_EENHEID;
      const breed = 1 + 2 * HALF;
      const blok = doos(level, mat.antwoord, 'box', [breed, hoog, breed], [x, hoog / 2, z]);
      // Fout antwoord: het blokje wiebelt (wiebelDraai, WIEBEL_DUUR s): "niet deze", zonder straf. Niet bij
      // verminderde beweging (zie effecten); de hint en de klank zeggen het dan.
      let wiebelVan = null;
      return {
        werkBij(spel) {
          if (blok.enabled === d.weg) blok.enabled = !d.weg;
          if (wiebelVan === null) return;
          const q = (spel.tijd - wiebelVan) / WIEBEL_DUUR;
          if (q >= 1 || d.weg) wiebelVan = null;
          blok.setEulerAngles(0, wiebelVan === null ? 0 : wiebelDraai(q), 0);
        },
        wiebel(t) { wiebelVan = t; },
        staat: () => ({
          zichtbaar: blok.enabled, breed: blok.getLocalScale().x, kleur: blok.render.material.diffuse.toString(),
          draai: blok.getLocalEulerAngles().y, wiebelVan,
        }),
      };
    },
  };

  function leeg() {
    for (const f of figuren) f.figuur.vernietig();
    figuren = [];
    tekeningen = [];
    ballen = [];
    buit = [];
    level?.destroy();
    level = null;
    vloer.enabled = false;
  }

  app.start();

  return {
    // Tekent het raster (vloer per vakje in de kleur van `vloer`, muren, treden x 0,5, finish) en elk ding van
    // het spel. Modules zeggen via 'beeld' wat ze zijn; dingen hebben een eigen tekening die de staat volgt.
    bouwLevel(spel) {
      leeg();
      const { raster } = spel;
      level = new pc.Entity('level');
      app.root.addChild(level);
      kleurVloer(vloerMesh, (k, r) => {
        const naam = raster.vloer(k, r);
        if (naam && !VLOERTINT[naam]) throw new Error(`beeld: geen vloerkleur voor '${naam}'`);
        return naam ? VLOERTINT[naam] : VLOER_NEUTRAAL;
      });
      vloer.enabled = true;
      for (let r = 0; r < RIJEN; r++) {
        for (let k = 0; k < KOLOMMEN; k++) {
          const m = raster.module(k, r);
          if (m.beeld === 'muur') doos(level, mat.muur, 'box', [1, MUURHOOGTE, 1], [k + 0.5, MUURHOOGTE / 2, r + 0.5], true);
          else if (m.beeld === 'trede') doos(level, mat.trede, 'box', [1, m.hoogte * HOOGTE_EENHEID, 1], [k + 0.5, (m.hoogte * HOOGTE_EENHEID) / 2, r + 0.5], true);
          else if (m.beeld === 'finish') doos(level, mat.finish, 'box', [1, 0.05, 1], [k + 0.5, 0.025, r + 0.5]);
          else if (m.beeld === 'water' || m.beeld === 'lava') doos(level, mat.gat, 'box', [1, 0.04, 1], [k + 0.5, 0.02, r + 0.5], true);
        }
      }
      app.batcher.generate([blokken.id]);
      for (const d of raster.dingen) {
        const teken = tekenaar[d.soort];
        if (!teken) throw new Error(`beeld: geen tekening voor '${d.soort}'`);
        tekeningen.push({ ding: d, ...teken(d, [d.cel[0] + 0.5, d.cel[1] + 0.5]) });
      }
      app.batcher.generate([vlotten.id, sterren.id]);
      // De witte bloedcel: een witte bol met een donkere rand, zodat hij ook op lichte vloer te zien is.
      const witteBol = (maat) => {
        const bol = doos(level, mat.bal, 'sphere', [0, 0, 0], VERBORGEN);
        bol.render.batchGroupId = afweer.id;
        const rand = new pc.Entity('rand');
        rand.addComponent('render', { type: 'torus', material: mat.balRand });
        rand.render.batchGroupId = afweer.id;
        rand.setLocalScale(1.1, 0.6, 1.1);
        bol.addChild(rand);
        bol.maat = maat; // zichtbare schaal; 0 = verborgen
        return bol;
      };
      ballen = Array.from({ length: MAX_BALLEN }, () => witteBol(2 * BAL_HALF));
      // De buit van elke schurk: tot BUIT_EINDBAAS kleine witte bloedcellen in een vierkantje op zijn vakje.
      buit = spel.buit.map(() => Array.from({ length: BUIT_EINDBAAS }, () => witteBol(0.22)));
      app.batcher.generate([afweer.id]);
      this.werkBij(spel);
    },
    laadTexturen: (urls) => Promise.all(urls.map((url) => laadTextuur(app, url))),
    // n figuren: de held en elke vijand, elk met zijn eigen uitsnede; de eindbaas groter getekend.
    zetFiguren(spel, [held, ...vijanden]) {
      for (const f of figuren) f.figuur.vernietig();
      figuren = [
        { rol: 'held', figuur: maakFiguur(app, held, camera), van: spel.held },
        ...spel.vijanden.map((v, i) => ({
          rol: v.eindbaas ? 'eindbaas' : 'vijand',
          figuur: maakFiguur(app, vijanden[i], camera, v.eindbaas ? EINDBAAS_GROOT : 1),
          van: v,
        })),
      ];
      // Sap per figuur: eigen ademfase, afgelegde weg (wiebel) en lopende animaties (speltijd van het begin).
      figuren.forEach((f, i) => {
        f.sap = { fase: i * 1.7, afgelegd: 0, vorig: null, loopt: 0, tijd: null, land: null, plop: null, hopje: null };
      });
      this.werkBij(spel);
    },
    // Gebeurtenissen van deze frame (spel.mjs, tik) -> animaties. Verandert niets aan het spel.
    effecten(gebeurtenissen, spel) {
      const held = figuren.find((f) => f.rol === 'held');
      if (!held) return;
      for (const e of gebeurtenissen) {
        if (e.soort === 'land') held.sap.land = { van: spel.tijd, k: Math.min(1, e.snelheid / 6) };
        if (e.soort === 'geraakt') {
          held.sap.plop = spel.tijd;
          held.sap.land = null;
          held.sap.vorig = null; // het terugzetten is geen afgelegde weg
          if (Number.isInteger(e.door)) figuren[e.door + 1].sap.hopje = spel.tijd;
        }
        if (e.soort === 'raak' && Number.isInteger(e.door)) figuren[e.door + 1].sap.hopje = spel.tijd;
        if (e.soort === 'antwoord' && !e.goed && !minderBeweging()) {
          tekeningen.find((t) => t.ding.soort === 'antwoord' && t.ding.letter === e.letter)?.wiebel(spel.tijd);
        }
      }
    },
    werkBij(spel) {
      for (const t of tekeningen) t.werkBij(spel);
      const f = ((spel.tijd % LIFT_RONDE) + LIFT_RONDE) % LIFT_RONDE;
      const puls = Math.max(0, ...LIFT_PULS_OP.map((p) => 1 - Math.abs(f - p) / 0.3));
      if (puls !== mat.liftRand.emissiveIntensity) {
        mat.liftRand.emissiveIntensity = puls; // alleen de intensiteit: geen wissel van shadervariant
        mat.liftRand.update();
      }
      const minder = minderBeweging();
      const zet = (bol, plek) => {
        const s = plek ? bol.maat : 0;
        if (bol.getLocalScale().x !== s) bol.setLocalScale(s, s, s);
        if (plek) bol.setPosition(...plek);
      };
      ballen.forEach((bal, i) => {
        const b = spel.ballen?.[i];
        zet(bal, b && [b.x, b.y, b.z]);
      });
      buit.forEach((bollen, i) => {
        const b = spel.buit?.[i];
        const n = b?.actief ? b.aantal : 0;
        bollen.forEach((bol, j) => zet(bol, j < n && [b.cel[0] + 0.5 + BUIT_PLEK[j][0], 0.12, b.cel[1] + 0.5 + BUIT_PLEK[j][1]]));
      });
      for (const f of figuren) {
        f.figuur.toon(f.van.weg !== true);
        if (f.van.weg) continue;
        f.figuur.zet(f.van.x, f.van.y, f.van.z, f.rol === 'held' ? f.van.grond : 0);
        f.figuur.vorm(vormVan(f, spel.tijd, minder));
      }
    },
    // Wereld → pixels in het canvas (CSS), voor labels in de DOM boven het canvas.
    naarScherm(x, y, z) {
      const s = camera.camera.worldToScreen(new pc.Vec3(x, y, z));
      return { x: s.x, y: s.y };
    },
    // Voor de speeltest (alleen lezen): wat er echt in de scène staat.
    staat: () => ({
      dingen: tekeningen.map((t) => ({ soort: t.ding.soort, cel: t.ding.cel, ...t.staat() })),
      figuren: figuren.map(({ rol, figuur }) => ({ rol, ...figuur.maat(), vorm: figuur.staat(), zichtbaar: figuur.zichtbaar() })),
      ballen: ballen.map((e) => ({ zichtbaar: e.getLocalScale().x > 0, ...(({ x, y, z }) => ({ x, y, z }))(e.getPosition()) })),
      buit: buit.map((bollen) => {
        const zichtbaar = bollen.filter((b) => b.getLocalScale().x > 0);
        const p = zichtbaar.map((b) => b.getPosition());
        return { bollen: zichtbaar.length, x: p.length ? p.reduce((t, q) => t + q.x, 0) / p.length : null, z: p.length ? p.reduce((t, q) => t + q.z, 0) / p.length : null };
      }),
      liftPuls: mat.liftRand.emissiveIntensity,
    }),
    // Voor het meetinstrument: driehoeken van de held en het aantal figuren, geteld in de scène.
    telFiguren() {
      const alle = app.root.find((e) => e.name === 'figuur');
      const driehoeken = alle.slice(0, 1).flatMap((f) => f.findComponents('render'))
        .flatMap((r) => r.meshInstances).reduce((som, mi) => som + mi.mesh.primitive[0].count / 3, 0);
      return { driehoeken, figuren: alle.length };
    },
    leeg,
    elkFrame: (cb) => app.on('update', cb),
    naVolgendFrame: (cb) => app.once('frameend', cb),
  };
}
