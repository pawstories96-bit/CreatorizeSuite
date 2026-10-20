export const castRoles = [
  "main",
  "suspect",
  "victim",
  "detective",
  "witness",
  "police",
  "extras",
];
export const castNames = {
  main: "Main character",
  suspect: "Suspect",
  victim: "Victim",
  detective: "Detective",
  witness: "Witness",
  police: "Police",
  extras: "Extras",
};
export const defaultCast = Object.fromEntries(
  castRoles.map((role) => [
    role,
    {
      body: "male",
      finish: "matte",
      color:
        role === "main"
          ? "#3b82f6"
          : role === "suspect"
            ? "#ef4444"
            : "#eff0ef",
    },
  ]),
);
export function castRole(e) {
  return (
    e.castRole ||
    { actor: "suspect", protagonist: "main", bystander: "extras" }[e.role] ||
    "extras"
  );
}
export function applyCastElement(e, cast, characterModels = {}, mode) {
  if (e.type !== "mannequin") return e;
  const choice =
    cast?.[castRole(e)] ||
    (mode === "mixamo"
      ? { ...defaultCast[castRole(e)], body: e.body || "male" }
      : null);
  if (!choice) return e;
  const bodyModel =
      mode === "mixamo" ? characterModels[choice.body]?.path : null,
    src = choice.src || bodyModel;
  if (mode === "mixamo" && !src)
    throw Error(
      `Import the ${choice.body} Mixamo character in Cast & motion before rendering this role.`,
    );
  return {
    ...e,
    role: "neutral",
    fill: choice.color,
    body: choice.body,
    finish: choice.finish,
    ...(src
      ? {
          type: "model",
          src,
          useHumanoidRig: choice.src ? !!choice.humanoid : !!bodyModel,
          fitHeight: e.height,
          instances: undefined,
        }
      : {}),
    material: {
      ...e.material,
      tint: src ? choice.color : undefined,
      recolor: choice.src ? !!choice.humanoid : !!bodyModel,
      roughness:
        choice.finish === "glossy"
          ? 0.19
          : choice.finish === "glow"
            ? 0.36
            : 0.85,
      metalness: choice.finish === "glossy" ? 0.22 : 0,
      emissive: choice.finish === "glow" ? choice.color : "#000000",
      emissiveIntensity: choice.finish === "glow" ? 0.65 : 0,
    },
  };
}
