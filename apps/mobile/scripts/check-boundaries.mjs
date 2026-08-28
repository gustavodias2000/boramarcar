import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const activeFiles = [
  "App.tsx",
  "supabaseConfig.ts",
  "android/app/build.gradle",
  "android/app/src/main/AndroidManifest.xml",
  "android/app/src/main/java/com/barbershopapp/MainActivity.kt",
  "android/app/src/main/java/com/barbershopapp/MainApplication.kt",
];

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path) : [path];
  }));
  return paths.flat();
}

const v1Files = await collect(join(root, "src", "v1"));
const files = activeFiles.map((file) => join(root, file)).concat(v1Files);
const forbidden = [
  { expression: /firebaseConfig/i, message: "configuração Firebase" },
  { expression: /from\s+["']firebase(?:\/|["'])/i, message: "SDK Firebase" },
  { expression: /@react-native-firebase/i, message: "SDK Firebase nativo" },
  { expression: /com\.barbershopapp/i, message: "package Android legado" },
  { expression: /barbershop-5dca2/i, message: "projeto Firebase legado" },
  { expression: /service_role/i, message: "chave administrativa" },
];

const failures = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const rule of forbidden) {
    if (rule.expression.test(content)) failures.push(relative(root, file) + ": " + rule.message);
  }
}

if (failures.length > 0) {
  console.error("A superfície ativa do app ainda contém dependências proibidas:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log("mobile active surface: no legacy backend identifiers");
