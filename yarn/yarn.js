import {parseSyml} from '@yarnpkg/parsers'
import process from 'node:process'
import path from 'node:path'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'

function parseResolution(text) {
  const nameEndIndex = text.indexOf('@', text.startsWith('@') ? 1 : 0)
  if (nameEndIndex === -1) {
    throw new Error(`Unexpected dependency name and version string '${text}'.`)
  }

  const name = text.slice(0, nameEndIndex)
  const version = text.slice(nameEndIndex + 1)
  let protocol
  if (version.startsWith('npm:')) {
    protocol = 'npm'
  }

  return {
    name,
    protocol,
  }
}

async function getDependencies() {
  const yarnLockFile = path.join(process.cwd(), 'yarn.lock')
  const content = await fs.readFile(yarnLockFile, 'utf8')
  const yarnLock = parseSyml(content)

  const seen = new Set()
  const dependencies = new Map()

  for (const [key, dependency] of Object.entries(yarnLock)) {
    if (key.startsWith('__') || seen.has(dependency.resolution)) {
      continue
    }

    seen.add(dependency.resolution)
    const {name, protocol} = parseResolution(dependency.resolution)

    if (!dependencies.has(name)) {
      dependencies.set(name, [])
    }

    dependencies.get(name).push({...dependency, name, protocol})
  }

  return dependencies
}

export {getDependencies}
