import { marked } from 'marked'

export default defineNuxtPlugin(() => {
  return {
    provide: {
      marked: (content: string) => marked.parse(content, { breaks: true }) as string,
    },
  }
})
