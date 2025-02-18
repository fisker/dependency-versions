import {getDependencies} from './index.js'
import styleText from 'node-style-text'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {timerel} from 'timerel'
import {table, getBorderCharacters} from 'table'

const cacheDirectory = new URL('./.cache/', import.meta.url)
const CACHE_TIME = 24 * 60 * 60 * 1000 // 1 Day

async function getPackageData(name) {
  const hash = `${name.replaceAll(/[\\/]/g, '_')}_${crypto
    .createHash('md5')
    .update(name)
    .digest('hex')}`
  const cacheFile = new URL(`${hash}.json`, cacheDirectory)

  let data
  try {
    data = await JSON.parse(await fs.readFile(cacheFile))
  } catch {
    // No op
  }

  if (data?.__time && Date.now() - data.__time < CACHE_TIME) {
    return data
  }

  const response = await fetch(`https://registry.npmjs.org/${name}`)
  data = await response.json()
  ;(async () => {
    // Don't care about the result
    await fs.mkdir(cacheDirectory, {recursive: true})
    await fs.writeFile(cacheFile, JSON.stringify({...data, __time: Date.now()}))
  })()
  return data
}

function getDependencyInformation(dependency, packageData) {
  let {version, resolution} = dependency

  let age
  const time = packageData.time?.[version]
  if (time) {
    age = timerel(Date.parse(time))
  }

  if (resolution.startsWith(`${packageData.name}@`)) {
    resolution = resolution.slice(packageData.name.length + 1)
  }

  return {
    Version: dependency.version,
    Age: age,
    Resolution: resolution,
  }
}

async function run() {
  const dependencies = await getDependencies()

  for (const [name, versions] of dependencies.entries()) {
    let title = styleText.green(name)
    if (versions.length > 1) {
      title += ` (${versions.length} versions)`
    }

    let packageData
    if (versions.some(({protocol}) => protocol === 'npm')) {
      try {
        packageData = await getPackageData(name)
      } catch {
        // No op
      }
    }

    const columns = [
      {name: 'Version', alignment: 'right'},
      {name: 'Age', alignment: 'right'},
      {name: 'Resolution'},
    ]
    console.log(
      table(
        versions
          .map((version) =>
            getDependencyInformation(version, {...packageData, name}),
          )
          .map((dependency) =>
            columns.map((column) => dependency[column.name]),
          ),
        {
          border: getBorderCharacters('norc'),
          header: {alignment: 'left', content: title},
          columns: columns.map(({alignment = 'left'}) => ({
            alignment,
          })),
        },
      ),
    )
  }
}
await run()
