import {getDependencies} from './index.js'
import styleText from 'node-style-text'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {timerel} from 'timerel'
import {table, getBorderCharacters} from 'table'
import yoctoSpinner from 'yocto-spinner'

const cacheDirectory = new URL('./.cache/', import.meta.url)
const CACHE_TIME = 24 * 60 * 60 * 1000 // 1 Day

const pluralize = (singular, number, plural = `${singular}s`) =>
  number === 1 ? singular : plural

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

  const spinner = yoctoSpinner({
    text: `Fetching package data '${styleText.green.underline(name)}'`,
  }).start()

  try {
    const response = await fetch(`https://registry.npmjs.org/${name}`)
    data = await response.json()
  } catch {
    // No op
  } finally {
    spinner.clear()
  }

  ;(async () => {
    // Don't care about the result
    await fs.mkdir(cacheDirectory, {recursive: true})
    await fs.writeFile(cacheFile, JSON.stringify({...data, __time: Date.now()}))
  })()
  return data
}

const columnSettings = [
  {
    name: 'Version',
    alignment: 'right',
    value: ({version}) => version,
  },
  {
    name: 'Age',
    alignment: 'right',
    value: ({relativeReleaseTime}) => relativeReleaseTime,
  },
  {
    name: 'Resolution',
    value: ({name, resolution}) =>
      resolution.startsWith(`${name}@`)
        ? resolution.slice(name.length + 1)
        : resolution,
  },
]

const tableBorder = getBorderCharacters('norc')
const tableOptions = {
  border: tableBorder,
  header: {alignment: 'left'},
  columns: columnSettings.map(({alignment = 'left'}) => ({
    alignment,
  })),
}

async function addPackageData(name, versions) {
  if (!versions.some(({protocol}) => protocol === 'npm')) {
    return
  }

  let packageData
  try {
    packageData = await getPackageData(name)
  } catch {
    // No op
  }

  if (!packageData) {
    return
  }

  for (const version of versions) {
    version.packageData = packageData
    const timeString = packageData?.time[version.version]
    if (!timeString) {
      continue
    }

    const releaseTimeStamp = Date.parse(timeString)
    version.releaseTimeStamp = releaseTimeStamp
    version.relativeReleaseTime = timerel(releaseTimeStamp)
  }
}

async function run() {
  const dependencies = await getDependencies()

  for (const {name, versions} of dependencies) {
    await addPackageData(name, versions)

    let title = styleText.green(name)
    if (versions.length > 1) {
      title += ` (${versions.length} ${pluralize('version', versions.length)})`
    }

    console.log(
      table(
        versions.map((dependency) =>
          columnSettings.map((column) => column.value(dependency)),
        ),
        {...tableOptions, header: {...tableOptions.header, content: title}},
      ),
    )
  }

  const versions = dependencies.flatMap(({versions}) => versions)

  console.log()
  console.log(
    `${styleText.green(String(versions.length))} ${pluralize('version', versions.length)} of ${styleText.green(String(dependencies.length))} ${pluralize('dependency', dependencies.length, 'dependencies')} found.`,
  )

  const oldestVersions = versions
    .filter(({releaseTimeStamp}) => releaseTimeStamp)
    .toSorted(
      (
        {releaseTimeStamp: releaseTimeStampA},
        {releaseTimeStamp: releaseTimeStampB},
      ) => releaseTimeStampA - releaseTimeStampB,
    )
    .slice(0, 5)

  if (oldestVersions.length !== 0) {
    console.log()
    console.log(
      table(
        oldestVersions.map((dependency) => [
          `${dependency.name}@${dependency.version}`,
          dependency.relativeReleaseTime,
        ]),
        {
          border: tableBorder,
          header: {
            alignment: 'left',
            content: `Oldest ${styleText.red(String(oldestVersions.length))} ${pluralize('version', oldestVersions.length)}`,
          },
        },
      ),
    )
  }
}

await run()
