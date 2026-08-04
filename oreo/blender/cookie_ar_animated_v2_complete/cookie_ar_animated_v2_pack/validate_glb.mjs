import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import validator from 'gltf-validator'


const ROOT = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(ROOT, 'cookie_ar_animated_v2.glb')
const bytes = new Uint8Array(await fs.readFile(FILE))
const report = await validator.validateBytes(bytes, {
  uri: path.basename(FILE),
  maxIssues: 200,
  ignoredIssues: ['UNUSED_OBJECT'],
})

await fs.writeFile(path.join(ROOT, 'gltf_validation_report.json'), `${JSON.stringify(report, null, 2)}\n`)
const counts = report.issues.numErrors + report.issues.numWarnings
console.log(JSON.stringify({
  errors: report.issues.numErrors,
  warnings: report.issues.numWarnings,
  infos: report.issues.numInfos,
  hints: report.issues.numHints,
}, null, 2))
if (counts > 0) process.exitCode = 1
