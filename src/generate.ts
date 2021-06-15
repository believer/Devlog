import data from '../data.json'
import fs from 'fs'
import { promisify } from 'util'
import path from 'path'
import {
  boldText,
  code,
  externalLink,
  image,
  inlineCode,
  italicText,
  link,
  tag,
  warning,
} from './elements'
import { isJournal, slugify } from './utils'

const writeFile = promisify(fs.writeFile)
const createDirectory = promisify(fs.mkdir)

const pagesDirectory = path.join('pages')
const journalsDirectory = path.join('journals')

export const references = new Map()

const ensureDirectory = async (dir: string) => {
  if (!fs.existsSync(dir)) {
    await createDirectory(dir)
  }
}

export const getContent = (
  children: any,
  contents: any = [],
  level = 0
): any => {
  for (const child of children) {
    if (child.properties?.public) {
      continue
    }

    if (child.body?.length > 0 && child.body?.[0][0] !== 'Horizontal_Rule') {
      let row = `<div class="element-block ml-${
        level * 4
      }"><div class="flex-1">`

      for (const [titleType, titleContent, ...rest] of child.body) {
        if (titleType === 'Src') {
          row += `\n\n${code(
            titleContent.lines.join(''),
            titleContent.language
          )}\n\n`
        }

        if (titleType === 'Custom' && titleContent === 'warning') {
          row += warning(rest[2])
        }

        contents.push(row + '</div></div>')
      }
    }

    if (child.title?.length > 0) {
      let row = `<div class="element-block ml-${
        level * 4
      }"><div class="flex-1">`

      for (const [titleType, titleContent] of child.title) {
        if (titleType === 'Plain') {
          row += titleContent
        }

        if (titleType === 'Tag') {
          row += tag(titleContent)
        }

        if (titleType === 'Code') {
          row += inlineCode(titleContent)
        }

        if (titleType === 'Link') {
          const linkType = titleContent.url[0]

          switch (linkType) {
            case 'Search':
              row += link(titleContent.url[1])
              break

            case 'Complex':
              row += externalLink(titleContent.url[1], titleContent.label[0][1])
              break

            case 'File':
              row += image(titleContent.url[1])
              break
          }
        }

        if (titleType === 'Emphasis' && titleContent[0][0] === 'Bold') {
          row += boldText(titleContent[1][0][1])
        }

        if (titleType === 'Emphasis' && titleContent[0][0] === 'Italic') {
          row += italicText(titleContent[1][0][1])
        }
      }

      contents.push(row + '</div></div>')
    }

    if (child.body?.[0]?.[0] === 'Horizontal_Rule') {
      contents.push('<hr class="border-gray-700 !my-5" />')
    }

    if (child.children.length > 0) {
      contents.push(getContent(child.children, contents, level + 1))
    } else {
      continue
    }
  }

  return contents
}

export const collectReferences = (children: any, title: string) => {
  for (const child of children) {
    if (child.title?.length > 0) {
      for (const [titleType, titleContent] of child.title) {
        if (titleType === 'Link' && titleContent.url[0] === 'Search') {
          const slugTitle = slugify(titleContent.url[1])

          if (references.has(slugTitle)) {
            const current = references.get(slugTitle)
            references.set(slugTitle, current.add(title))
          } else {
            const newSet = new Set()
            references.set(slugTitle, newSet.add(title))
          }
        }
      }

      if (child.children.length > 0) {
        collectReferences(child.children, title)
      } else {
        continue
      }
    }
  }
}

const createFrontmatter = ({
  id,
  title,
  contents,
}: {
  id: string
  title: string
  contents?: Array<string>
}) => {
  const excerpt =
    contents?.[0]?.replace(/<[^>]*>/g, '').replace(/#\w+/g, '') ?? ''

  return `---
layout: page
id: '${id}'
title: '${title}'
tags: ${isJournal(title) ? 'journal' : 'page'}
${
  excerpt
    ? `excerpt: |
  ${excerpt}
`
    : ''
}
---
  `
}

const linkedReferences = (slug: string) => {
  if (!references.has(slug)) {
    return ''
  }

  const linksForPage = [...references.get(slug)]
    .map((title: string) => {
      return `<a class="block bg-gray-800 p-4 rounded text-teal-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-teal-400 hover:ring-2 hover:ring-offset-2 hover:ring-offset-gray-900 hover:ring-teal-400" href="/${
        isJournal(title) ? 'journals' : 'pages'
      }/${slugify(title)}">${title}</a>`
    })
    .join('\n')

  return `
<section class="mt-8 space-y-2">
<header class="text-gray-400">Linked references</header>
${linksForPage}
  </section>`
}

const run = async () => {
  await ensureDirectory(pagesDirectory)
  await ensureDirectory(journalsDirectory)

  // Collect all references and store them in a local Map for later
  for (const { children, ['page-name']: title } of data.blocks) {
    collectReferences(children, title)
  }

  // Render all children
  for (const { id, children, ['page-name']: title } of data.blocks) {
    const slug = slugify(title)

    // Skip pages without content and linked references
    if (
      (children.length === 0 || children[0].content === '') &&
      !references.has(slug)
    ) {
      continue
    }

    const contents = getContent(children)

    const fileContent = `${createFrontmatter({ id, title, contents })}
<h2 class="text-3xl font-semibold mb-4"><a class="rounded-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-pink-400" href="/${
      isJournal(title) ? 'journals' : 'pages'
    }/${slugify(title)}">${title}</a></h2>

<div class="space-y-3">
${contents.join('\n\n')}
</div>

${linkedReferences(slug)}
`

    // Write markdown files
    const fileDirectory = isJournal(title) ? journalsDirectory : pagesDirectory
    const filePath = path.join(fileDirectory, `${slug}.md`)

    await writeFile(filePath, fileContent, {
      flag: 'w',
    })
  }
}

run()