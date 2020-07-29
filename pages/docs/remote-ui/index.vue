<template>
  <article>
    <h1>{{ page.title }}</h1>
    <nuxt-content :document="page" />
  </article>
</template>

<script>
  export default {
    async asyncData ({ $content }) {
      const page = await $content('docs/remote-ui').fetch()

      return {
        page
      }
    }
  }
</script>
