import { asStartAt, dayKey, shortDate } from "./theme";

describe("tokens de agenda mobile", () => {
  it("mantém o dia local sem deslocar o calendário para UTC", () => {
    expect(dayKey(new Date(2026, 7, 28, 23, 50))).toBe("2026-08-28");
  });

  it("envia horário operacional com o fuso brasileiro explícito", () => {
    expect(asStartAt("2026-08-28", "14:30")).toBe("2026-08-28T14:30:00-03:00");
  });

  it("usa uma data legível nos chips da agenda", () => {
    expect(shortDate("2026-08-28")).toContain("28");
  });
});
