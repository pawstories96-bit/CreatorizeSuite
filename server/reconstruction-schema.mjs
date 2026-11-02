import { z } from "zod";
import { reconstructionKinds } from "../public/lib/reconstruction/catalog.js";
const number = (min, max) => z.number().finite().min(min).max(max).optional();
const color = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .optional();
const point = z.tuple([
  z.number().min(-1000).max(1000),
  z.number().min(-100).max(300),
  z.number().min(-1000).max(1000),
]);
const lonlat = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-85).max(85),
]);
const opening = z.object({
  wall: z.enum(["front", "back", "left", "right"]),
  x: number(-100, 100),
  y: number(0, 30),
  w: number(0.1, 30),
  h: number(0.1, 30),
});
// Only supported data parameters cross the agent boundary. No functions or arbitrary JS.
export const reconstructionSchema = z
  .object({
    kind: z.enum(reconstructionKinds),
    options: z
      .object({
        length: number(20, 80),
        radius: number(0.05, 10),
        color,
        accent: color,
        tailColor: color,
        windowColor: color,
        windows: z.union([z.boolean(), z.array(opening).max(20)]).optional(),
        cutaway: z.union([z.boolean(), z.literal("top")]).optional(),
        engines: z.boolean().optional(),
        rows: z.number().int().min(1).max(50).optional(),
        pitch: number(0.65, 1.5),
        left: z.number().int().min(1).max(4).optional(),
        right: z.number().int().min(1).max(4).optional(),
        width: number(2, 8),
        seatColor: color,
        wallColor: color,
        carpet: color,
        base: color,
        trim: color,
        glass: color,
        screen: color,
        doorOpen: number(0, 1),
        w: number(0.1, 100),
        d: number(0.1, 100),
        h: number(0.1, 50),
        wall: color,
        floor: color,
        ceiling: z.boolean().optional(),
        open: z.enum(["front", "back", "left", "right", "none"]).optional(),
        door: opening.optional(),
        len: number(0.1, 15),
        lights: z.boolean().optional(),
        points: z.array(point).min(4).max(60).optional(),
        closed: z.boolean().optional(),
        gauge: number(0.5, 3),
        ties: number(0.5, 5),
        chain: z.union([z.literal(false), z.literal("lift")]).optional(),
        catwalk: z.union([z.literal(false), z.literal("lift")]).optional(),
        supports: z
          .union([
            z.literal(false),
            z.object({
              every: number(3, 40),
              minY: number(0, 30),
              spread: number(0.5, 8),
            }),
          ])
          .optional(),
        cars: z.number().int().min(1).max(12).optional(),
        across: z.number().int().min(1).max(4).optional(),
        gap: number(2.5, 5),
        colors: z
          .object({
            track: color,
            rail: color,
            support: color,
            walk: color,
            chain: color,
            body: color,
            seat: color,
            bar: color,
            dark: color,
            metal: color,
          })
          .optional(),
        center: lonlat.optional(),
        rMin: number(0, 300),
        rMax: number(1, 800),
        count: z.number().int().min(1).max(2000).optional(),
        farCount: z.number().int().min(0).max(4000).optional(),
        farMax: number(1, 2000),
        palette: z
          .enum([
            "autumn",
            "summer",
            "pine",
            "dry",
            "tropical",
            "winter",
            "clay",
          ])
          .optional(),
        conifers: number(0, 1),
        height: z
          .tuple([z.number().min(0.2).max(40), z.number().min(0.2).max(60)])
          .optional(),
        groundY: number(-100, 100),
        seed: z.number().int().min(0).max(100000).optional(),
        roofColor: color,
        steps: z.number().int().min(1).max(100).optional(),
        rise: number(0.05, 0.5),
        run: number(0.1, 1),
        light: color,
        on: z.boolean().optional(),
        stripe: color,
        s: number(0.05, 5),
        ink: color,
        posts: z.boolean().optional(),
        glow: number(0, 3),
        rx: number(0.1, 100),
        rz: number(0.1, 100),
        opacity: number(0, 1),
        r: number(0.01, 2),
        kmPerUnit: number(1, 200),
        span: z
          .tuple([z.number().min(1).max(170), z.number().min(1).max(80)])
          .optional(),
        land: color,
        seaColor: color,
        border: color,
        extrude: number(0.01, 5),
        highlight: z
          .record(z.string().max(100), z.string().regex(/^#[0-9a-f]{6}$/i))
          .refine((v) => Object.keys(v).length <= 60)
          .optional(),
        alaska: z.boolean().optional(),
        sea: z.boolean().optional(),
      })
      .strict()
      .default({}),
    motion: z
      .object({
        from: z.number().min(-2000).max(2000).default(0),
        to: z.number().min(-2000).max(2000).default(0),
        delay: z.number().min(0).default(0),
        duration: z.number().min(0.05).max(3600).default(5),
      })
      .optional(),
    route: z.array(lonlat).min(2).max(30).optional(),
    pins: z.array(lonlat).max(30).optional(),
  })
  .superRefine((v, ctx) => {
    const fail = (message) => ctx.addIssue({ code: "custom", message });
    if (["coaster", "train", "railing"].includes(v.kind) && !v.options.points)
      fail(`${v.kind} requires researched path points`);
    if (
      v.kind === "cockpit" &&
      v.motion &&
      (v.motion.from < 0 ||
        v.motion.from > 1 ||
        v.motion.to < 0 ||
        v.motion.to > 1)
    )
      fail("Cockpit door motion must be between 0 and 1");
    if (v.options.rMin >= v.options.rMax) fail("Forest rMax must exceed rMin");
    if (v.options.height && v.options.height[1] < v.options.height[0])
      fail("Forest height range must be ordered");
    if (v.options.points) {
      const p = v.options.points;
      const length = p
        .slice(1)
        .reduce(
          (s, b, i) => s + Math.hypot(...b.map((x, j) => x - p[i][j])),
          0,
        );
      if (
        length < 1 ||
        length > 2000 ||
        p
          .slice(1)
          .some((b, i) => Math.hypot(...b.map((x, j) => x - p[i][j])) < 0.01)
      )
        fail("Path needs distinct consecutive points and length 1–2000 metres");
    }
  });
export const evidenceSchema = z
  .object({
    kind: z.enum(["quote", "article", "statement", "stat", "chart"]),
    title: z.string().max(120).default(""),
    text: z.string().max(900).default(""),
    source: z.string().min(1).max(180),
    who: z.string().max(100).default(""),
    value: z.string().max(30).default(""),
    theme: z.enum(["light", "dark"]).default("light"),
    highlights: z
      .array(
        z.object({
          phrase: z.string().min(1).max(200),
          at: z.number().min(0),
          duration: z.number().min(0.05).max(60).default(0.7),
        }),
      )
      .max(8)
      .default([]),
    points: z
      .array(z.tuple([z.number().finite(), z.number().finite()]))
      .min(2)
      .max(100)
      .optional(),
    xLabel: z.string().max(60).default(""),
    yLabel: z.string().max(60).default(""),
    delay: z.number().min(0).default(0),
    duration: z.number().min(0.05).max(3600).default(4),
  })
  .superRefine((v, ctx) => {
    if (
      v.kind === "chart" &&
      (!v.points ||
        v.points.some((p, i) => i > 0 && p[0] <= v.points[i - 1][0]))
    )
      ctx.addIssue({
        code: "custom",
        message: "Chart requires data with strictly increasing x values",
      });
    for (const h of v.highlights)
      if (!v.text.includes(h.phrase))
        ctx.addIssue({
          code: "custom",
          message: "Highlight phrase must occur verbatim in the excerpt",
        });
  });
