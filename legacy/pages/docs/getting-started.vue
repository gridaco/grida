<template>
  <article>
    <h1>{{ page.title }}</h1>
    <nuxt-content :document="page" />
  </article>
</template>

<script>
export default {
  layout: "docs",
  async asyncData({ $content }) {
    const page = await $content("docs/getting-started").fetch();

    return {
      page,
    };
  },
};
</script>
