// Een figuur als kartonnen uitsnede: de voorkant op een vlak dat naar de camera kijkt, bovenop getekend
// (depthTest uit, dus nooit weg achter een muur), met een schaduwovaal op de grond eronder.
// Grootte is alleen uiterlijk: de botsvorm staat in logica/beweging.mjs en is voor iedereen gelijk.
// Sap (DEV.md, Sap en geluid): de tekening kan rekken, pletten en kantelen (vorm), altijd met de voeten op de grond.
// maat() blijft de rustmaat van de tekening; de vervorming staat apart en raakt de botsvorm nooit.
import * as pc from 'playcanvas';
import { MAX_BREED, MAX_HOOG } from './maten.mjs';

const textuurCache = new Map();
export function laadTextuur(app, url) {
  if (!textuurCache.has(url)) {
    textuurCache.set(url, new Promise((ok, fout) => {
      const asset = new pc.Asset(url, 'texture', { url }, { srgb: true, mipmaps: true });
      asset.once('load', () => ok(asset.resource));
      asset.once('error', (e) => { textuurCache.delete(url); fout(new Error(`figuur ${url}: ${e}`)); });
      app.assets.add(asset);
      app.assets.load(asset);
    }));
  }
  return textuurCache.get(url);
}

let schaduwMat = null;
function schaduwMateriaal() {
  if (schaduwMat) return schaduwMat;
  schaduwMat = new pc.StandardMaterial();
  schaduwMat.useLighting = false;
  schaduwMat.diffuse = new pc.Color(0, 0, 0);
  schaduwMat.emissive = new pc.Color(0, 0, 0);
  schaduwMat.opacity = 0.35;
  schaduwMat.blendType = pc.BLEND_NORMAL;
  schaduwMat.depthWrite = false;
  schaduwMat.update();
  return schaduwMat;
}

// groot: alleen uiterlijk (de eindbaas wordt groter getekend); de botsvorm staat in de logica en verandert niet.
export function maakFiguur(app, textuur, camera, groot = 1) {
  const schaal = Math.min(MAX_BREED / textuur.width, MAX_HOOG / textuur.height) * groot;
  const breed = textuur.width * schaal;
  const hoog = textuur.height * schaal;

  const mat = new pc.StandardMaterial();
  mat.useLighting = false; // kleuren zoals getekend
  mat.diffuse = new pc.Color(0, 0, 0);
  mat.emissive = new pc.Color(1, 1, 1);
  mat.emissiveMap = textuur;
  mat.opacityMap = textuur;
  mat.opacityMapChannel = 'a';
  mat.blendType = pc.BLEND_NORMAL;
  mat.depthTest = false;
  mat.depthWrite = false;
  mat.cull = pc.CULLFACE_NONE;
  mat.update();

  const schaduw = new pc.Entity('schaduw');
  schaduw.addComponent('render', { type: 'cylinder', material: schaduwMateriaal() });
  schaduw.setLocalScale(breed * 0.7, 0.002, 0.45);
  app.root.addChild(schaduw);

  // Het vlak (plane, normaal +Y) krijgt de stand van de camera, 90° om X gekanteld: dan kijkt het naar
  // de camera en staat de bovenkant van de tekening boven. De onderrand staat op de voeten.
  // Daartussen zit 'vorm': die staat zoals de camera (x = rechts, y = omhoog in beeld), kantelt om de kijkas en
  // schaalt in het beeldvlak. Omdat de onderrand in zijn oorsprong ligt, blijven de voeten op hun plek.
  const wortel = new pc.Entity('figuur');
  const vorm = new pc.Entity('vorm');
  const kaart = new pc.Entity('uitsnede');
  kaart.addComponent('render', { type: 'plane', material: mat });
  wortel.addChild(vorm);
  vorm.addChild(kaart);
  const camStand = camera.getRotation().clone();
  const kantelQ = new pc.Quat();
  const stand = new pc.Quat();
  vorm.setLocalRotation(camStand);
  kaart.setLocalEulerAngles(90, 0, 0);
  kaart.setLocalScale(breed, 1, hoog);
  kaart.setLocalPosition(0, hoog / 2, 0);
  app.root.addChild(wortel);
  let nu = { sx: 1, sy: 1, kantel: 0 };

  return {
    zet(x, y, z, grond) {
      wortel.setPosition(x, y, z);
      schaduw.setPosition(x, grond + 0.01, z);
    },
    // Sap: rekken (sx, sy in het beeldvlak) en kantelen om de kijkas (graden), met de voeten als draaipunt.
    vorm({ sx = 1, sy = 1, kantel = 0 } = {}) {
      if (sx === nu.sx && sy === nu.sy && kantel === nu.kantel) return;
      nu = { sx, sy, kantel };
      kantelQ.setFromAxisAngle(pc.Vec3.BACK, kantel);
      vorm.setLocalRotation(stand.mul2(camStand, kantelQ));
      vorm.setLocalScale(sx, sy, 1);
    },
    // Wat er echt in de scène staat (voor de speeltest): de vervorming apart van de rustmaat.
    staat() {
      const s = vorm.getLocalScale();
      return { sx: s.x, sy: s.y, kantel: nu.kantel };
    },
    // De getekende maat in de wereld, gelezen van het vlak zelf (voor de speeltest: de eindbaas is groter).
    maat() {
      const s = kaart.getLocalScale();
      return { breed: s.x, hoog: s.z };
    },
    // Een verslagen schurk is weg (gooien.mjs): figuur en schaduw uit beeld.
    toon(aan) {
      if (wortel.enabled === aan) return;
      wortel.enabled = aan;
      schaduw.enabled = aan;
    },
    zichtbaar: () => wortel.enabled,
    vernietig() {
      wortel.destroy();
      schaduw.destroy();
      mat.destroy();
    },
  };
}
