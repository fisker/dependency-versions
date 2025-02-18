import {getDependencies} from './index.js'
import styleText from 'node-style-text'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {timerel} from 'timerel'
import {table, getBorderCharacters} from 'table'
import yoctoSpinner from 'yocto-spinner'
import boxen from 'boxen'
import meow from 'meow'

const cacheDirectory = new URL('./.cache/', import.meta.url)
const CACHE_TIME = 24 * 60 * 60 * 1000 // 1 Day

const pluralize = (singular, number, plural = `${singular}s`) =>
  number === 1 ? singular : plural

async function getPackageData(name, options) {
  const hash = `${name.replaceAll(/[\\/]/g, '_')}_${crypto
    .createHash('md5')
    .update(name)
    .digest('hex')}`
  const cacheFile = new URL(`${hash}.json`, cacheDirectory)

  let data
  if (options.cache) {
    try {
      data = await JSON.parse(await fs.readFile(cacheFile))
    } catch {
      // No op
    }

    if (data?.__time && Date.now() - data.__time < CACHE_TIME) {
      return data
    }
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
  // width: 100,
}

async function addPackageData(name, versions, options) {
  if (!versions.some(({protocol}) => protocol === 'npm')) {
    return
  }

  let packageData
  try {
    packageData = await getPackageData(name, options)
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

async function run(options) {
  const dependencies = await getDependencies()

  for (const {name, versions} of dependencies) {
    await addPackageData(name, versions, options)

    if (!options.verbose) continue

    let title = styleText.green(name)
    if (versions.length > 1) {
      title += ` (${versions.length} ${pluralize('version', versions.length)})`
    }

    console.log(
      table(
        [
          columnSettings.map(({name}) => name),
          ...versions.map((dependency) =>
            columnSettings.map((column) => column.value(dependency)),
          ),
        ],
        {...tableOptions, header: {...tableOptions.header, content: title}},
      ),
    )
  }

  const versions = dependencies.flatMap(({versions}) => versions)

  console.log()
  console.log(
    boxen(
      `${styleText.green(String(versions.length))} ${pluralize('version', versions.length)} of ${styleText.green(String(dependencies.length))} ${pluralize('dependency', dependencies.length, 'dependencies')} found.`,
      {padding: 1, fullscreen: (width, height) => [width], align: 'center'},
    ),
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

const cli = meow(
  /* Indent */ `
    Usage
      $ foo <input>

    Options
      --verbose List all packages
      --no-cache Disable cache

    Examples
      $ dependency-versions
  `,
  {
    importMeta: import.meta,
    flags: {
      verbose: {type: 'boolean', default: false},
      cache: {type: 'boolean', default: true},
    },
  },
)

await run(cli.flags)
