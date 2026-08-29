import { inviteCodeFromUrl, labelForBusiness } from "./domain";

describe("links de convite", () => {
  it("extrai somente um código válido do deep link Bora Marcá", () => {
    expect(inviteCodeFromUrl("boramarca://convite/ABCD2345")).toBe("ABCD2345");
    expect(inviteCodeFromUrl("https://empresa.exemplo/convite/ABCD2345")).toBeNull();
    expect(inviteCodeFromUrl("boramarca://convite/curto")).toBeNull();
  });
});

describe("segmento compartilhado", () => {
  it("não fixa o vocabulário de barbearia fora do núcleo", () => {
    expect(labelForBusiness("barbershop")).toBe("Barbearia");
  });
});
