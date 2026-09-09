import path from "node:path"
import { pathToFileURL } from "node:url"
const subject = await import(pathToFileURL(path.join(process.cwd(), "subject.ts")).href)
const passed =
  process.argv[2] === "addition"
    ? subject.add(2, 3) === 5 && subject.add(-5, 2) === -3 && subject.add(0, 0) === 0
    : subject.clamp(5, 0, 10) === 5 && subject.clamp(-1, 0, 10) === 0 && subject.clamp(15, 0, 10) === 10
console.log(passed ? "Oracle passed" : "Oracle failed")
process.exitCode = passed ? 0 : 1
