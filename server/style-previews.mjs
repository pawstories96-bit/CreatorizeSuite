import { validateScene } from "./core.mjs";
export function stylePreview(style, look) {
  const vertical = style === "lowpoly";
  let scene;
  if (["3d", "lowpoly"].includes(style)) {
    const dark = /Investigation|Moody|PS1/.test(look || "");
    const elements = [
      {
        id: "floor",
        type: "box",
        x: 0,
        y: -0.1,
        z: 0,
        width: 12,
        height: 0.2,
        depth: 10,
        fill: dark ? "#343b43" : "#E8EAED",
        material: { roughness: 0.95 },
      },
      {
        id: "back-wall",
        type: "box",
        x: 0,
        y: 1.7,
        z: -4,
        width: 12,
        height: 3.4,
        depth: 0.2,
        fill: dark ? "#303842" : "#dedfdd",
      },
      {
        id: "person",
        type: "mannequin",
        x: -1.8,
        y: 0,
        z: 0,
        role: "protagonist",
        height: 1.8,
        pose: "walk",
        material: { fresnel: style === "3d", flatShading: style === "lowpoly" },
        keyframes: [
          { time: 0, x: -2 },
          { time: 8, x: 1 },
        ],
      },
      {
        id: "actor",
        type: "mannequin",
        x: 2.3,
        y: 0,
        z: -1,
        role: "actor",
        height: 1.8,
        pose: "point",
        highlight: dark,
        material: { fresnel: style === "3d" },
      },
      {
        id: "tank",
        type: "cylinder",
        x: -3,
        y: 0.85,
        z: -2,
        radius: 0.6,
        height: 1.7,
        fill: "#c9c7b0",
      },
      {
        id: "pump",
        type: "box",
        x: 0,
        y: 0.3,
        z: -2,
        width: 0.9,
        height: 0.6,
        depth: 0.6,
        fill: "#6986a5",
      },
      {
        id: "pipe",
        type: "tube",
        points: [
          { x: -3, y: 0.4, z: -2 },
          { x: -1.5, y: 0.4, z: -2 },
          { x: -0.45, y: 0.4, z: -2 },
        ],
        tubeRadius: 0.09,
        fill: "#d8d9d3",
      },
      {
        id: "callout",
        type: "text",
        x: vertical ? 360 : 910,
        y: vertical ? 180 : 150,
        width: 260,
        height: 48,
        fontSize: 24,
        text: "CONNECTED SYSTEM",
        fill: dark ? "#e6d879" : "#203849",
        anchor3d: { x: 0, y: 0.6, z: -2 },
      },
    ];
    if (look === "Investigation")
      elements.push({
        id: "evidence",
        type: "evidence-board",
        x: 0,
        y: 2,
        z: -3.8,
        width: 4,
        height: 2.2,
        depth: 0.15,
        seed: 9,
      });
    scene = {
      background: dark ? "#19232c" : "#c5d1d5",
      cameraRig: {
        type: "orbit",
        radius: vertical ? 10 : 12,
        height: 6,
        speed: 0.1,
        target: { x: 0, y: 1, z: -0.5 },
      },
      lighting: { ambient: dark ? 0.5 : 1.8, key: dark ? 4 : 3 },
      effects: {
        ssao: true,
        outline: true,
        grain: dark ? 0.09 : 0,
        fog: dark ? { color: "#19232c", near: 10, far: 35 } : undefined,
      },
      elements,
    };
    if (style === "3d" && !dark) {
      scene = {
        background: "#c9d8df",
        environment: {
          kind: "exterior",
          skyTop: "#749ec1",
          skyHorizon: "#d8e3e4",
        },
        cameraFov: 43,
        camera: { x: 8, y: 4, z: 10 },
        cameraRig: {
          type: "dolly",
          target: { x: 0, y: 1.15, z: -1 },
          to: { x: 6, y: 3.2, z: 8.5 },
          duration: 8,
          easing: "smooth",
        },
        lighting: { ambient: 1.05, key: 2.6 },
        effects: { ssao: true, fog: { color: "#d8e3e4", near: 65, far: 180 } },
        elements: [
          ...elements.filter(
            (e) =>
              !["floor", "back-wall", "person", "actor", "callout"].includes(
                e.id,
              ),
          ),
          {
            id: "ground",
            type: "box",
            width: 350,
            height: 0.3,
            depth: 350,
            y: -0.16,
            fill: "#8c9d7d",
          },
          {
            id: "service-path",
            type: "box",
            width: 8,
            height: 0.08,
            depth: 100,
            x: 0.5,
            y: -0.01,
            fill: "#aaa99d",
          },
          {
            id: "workshop",
            type: "box",
            width: 15,
            height: 5,
            depth: 9,
            x: 0,
            y: 2.5,
            z: -11,
            fill: "#c1b7a5",
          },
          {
            id: "roof",
            type: "box",
            width: 15.7,
            height: 0.25,
            depth: 9.7,
            x: 0,
            y: 5.12,
            z: -11,
            fill: "#5c6870",
          },
          {
            id: "door",
            type: "box",
            width: 2,
            height: 2.5,
            depth: 0.12,
            x: 2,
            y: 1.25,
            z: -6.45,
            fill: "#526878",
          },
          ...[-4, -1, 5].map((x, i) => ({
            id: `window-${i}`,
            type: "box",
            width: 1.8,
            height: 1.3,
            depth: 0.14,
            x,
            y: 3.2,
            z: -6.44,
            fill: "#657d89",
          })),
          {
            id: "worker",
            type: "mannequin",
            x: -0.8,
            y: 0,
            z: 0.9,
            height: 1.78,
            fill: "#f0efec",
            pose: "walk",
            keyframes: [
              { time: 0, x: -1.2 },
              { time: 8, x: 0.7 },
            ],
          },
          {
            id: "colleague",
            type: "mannequin",
            x: 2.5,
            y: 0,
            z: -1.6,
            height: 1.73,
            fill: "#eeeae3",
            pose: "point",
            rotation: -70,
          },
          ...[-1, 1].flatMap((side) =>
            [0, 1, 2, 3, 4].flatMap((i) => [
              {
                id: `trunk-${side}-${i}`,
                type: "cylinder",
                x: side * (12 + i * 3),
                y: 2.5,
                z: -i * 12 - 2,
                height: 5,
                radius: 0.3,
                fill: "#746354",
              },
              {
                id: `crown-${side}-${i}`,
                type: "sphere",
                x: side * (12 + i * 3),
                y: 6,
                z: -i * 12 - 2,
                radius: 3.2,
                fill: i % 2 ? "#657d53" : "#789060",
              },
            ]),
          ),
        ],
      };
    }
  } else if (style === "collage") {
    scene = {
      background: "#e9dfc8",
      elements: [
        {
          id: "paper",
          type: "rect",
          x: 660,
          y: 375,
          width: 610,
          height: 380,
          fill: "#c4cbd0",
          rotation: -5,
        },
        {
          id: "heading",
          type: "text",
          x: 630,
          y: 170,
          width: 1000,
          height: 100,
          fontSize: 72,
          text: "FOLLOW THE EVIDENCE",
          fill: "#222827",
        },
        {
          id: "annotation",
          type: "circle",
          x: 760,
          y: 375,
          radius: 90,
          fill: "none",
          stroke: "#b43e32",
          strokeWidth: 8,
          animation: "pulse",
        },
        ...[120, 200, 280, 350].map((height, i) => ({
          id: `bar-${i}`,
          type: "rect",
          x: 420 + i * 130,
          y: 550 - height / 2,
          width: 70,
          height,
          fill: ["#718979", "#728994", "#bc9059", "#af5144"][i],
          animation: "slide",
          delay: i * 0.25,
          duration: 1,
        })),
      ],
    };
  } else {
    scene = {
      background:
        style === "pixel"
          ? "#b8d4d0"
          : style === "paint"
            ? "#faf8f0"
            : "#dce5df",
      kits: [
        {
          id: "character",
          type: "character",
          x: 620,
          y: 420,
          scale: 1.5,
          walk: true,
          style,
        },
        { id: "tree", type: "tree", x: 280, y: 400, scale: 1.3, style },
        { id: "building", type: "building", x: 980, y: 360, scale: 1.3, style },
      ],
      elements: [
        {
          id: "ground",
          type: "rect",
          x: 640,
          y: 640,
          width: 1280,
          height: 160,
          fill: style === "paint" ? "#f2eddc" : "#a2bfad",
        },
        {
          id: "sun",
          type: "circle",
          x: 950,
          y: 140,
          radius: 48,
          fill: "#e7b85b",
          animation: "pulse",
        },
      ],
    };
    if (style === "talking")
      scene = {
        background: "#b9b2a4",
        kits: [
          { id: "presenter", type: "character", x: 640, y: 420, scale: 2.2 },
        ],
        elements: [
          {
            id: "caption",
            type: "text",
            x: 640,
            y: 650,
            width: 1000,
            height: 60,
            text: "Your camera footage, with supporting graphics",
            fontSize: 32,
            fill: "#ffffff",
          },
        ],
      };
  }
  if (style === "3d" && look && !["Studio", "Investigation"].includes(look)) {
    const clay = look === "White clay" || look === "Mechanism studio";
    scene = clay
      ? {
          camera: { x: -0.75, y: 1.8, z: 0.12 },
          cameraFov: 56,
          cameraRig: {
            type: "dolly",
            target: { x: 1.6, y: 0.95, z: -0.3 },
            to: { x: -0.5, y: 1.74, z: 0.08 },
            duration: 8,
            easing: "smooth",
          },
          footnote:
            "Illustrative narrow-body cockpit · procedural reconstruction",
          elements: [
            {
              id: "cockpit",
              type: "reconstruction3d",
              reconstruction: { kind: "cockpit", options: { cutaway: false } },
            },
          ],
        }
      : look === "Dark map"
        ? {
            camera: { x: 70, y: 160, z: 140 },
            cameraRig: {
              type: "dolly",
              target: { x: 0, y: 0, z: 0 },
              to: { x: 60, y: 150, z: 130 },
              duration: 8,
            },
            footnote: "Natural Earth · schematic geography",
            elements: [
              {
                id: "map",
                type: "reconstruction3d",
                reconstruction: {
                  kind: "worldMap",
                  options: {
                    center: [15, 45],
                    span: [25, 20],
                    kmPerUnit: 40,
                    land: "#657180",
                    seaColor: "#27313e",
                    border: "#8b99a8",
                    highlight: { France: "#2f6fdb" },
                  },
                },
              },
            ],
          }
        : {
            camera: { x: 12, y: 6, z: 16 },
            cameraRig: {
              type: "dolly",
              target: { x: 0, y: 1.2, z: 0 },
              to: { x: 10, y: 5, z: 14 },
              duration: 8,
            },
            footnote: "Illustrative location · procedural reconstruction",
            elements: [
              {
                id: "ground",
                type: "box",
                width: 400,
                height: 0.2,
                depth: 400,
                y: -0.1,
                fill: "#737e58",
              },
              {
                id: "trees",
                type: "reconstruction3d",
                z: -45,
                reconstruction: {
                  kind: "forest",
                  options: {
                    count: 180,
                    rMin: 12,
                    rMax: 40,
                    height: [7, 13],
                    palette: "summer",
                    seed: 6,
                  },
                },
              },
              {
                id: "plaza",
                type: "box",
                width: 20,
                height: 0.08,
                depth: 16,
                fill: "#b6ae9f",
              },
              {
                id: "canopy",
                type: "reconstruction3d",
                z: -3,
                reconstruction: {
                  kind: "canopy",
                  options: {
                    w: 9,
                    d: 5,
                    h: 3,
                    color: "#d2d3ce",
                    roofColor: "#e2dcca",
                  },
                },
              },
              {
                id: "bench",
                type: "reconstruction3d",
                x: 2,
                reconstruction: { kind: "bench", options: {} },
              },
              {
                id: "car",
                type: "reconstruction3d",
                x: -4,
                z: 4,
                reconstruction: { kind: "car", options: { color: "#607987" } },
              },
              {
                id: "light",
                type: "reconstruction3d",
                x: 6,
                z: 3,
                reconstruction: { kind: "lamp", options: { h: 4, on: true } },
              },
            ],
          };
  }
  return {
    id: "style-preview",
    style,
    look,
    title: "Style preview",
    format: vertical ? "9:16" : "16:9",
    durationSec: 8,
    words: [],
    shots: [{ id: "preview", start: 0, end: 8, scene: validateScene(scene) }],
  };
}
