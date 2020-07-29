<template>
  <v-app light>
    <v-app-bar fixed color="white" elevate-on-scroll app>
      <!--      <v-toolbar-title v-text="title" />-->
      <nuxt-link to="/">
        <img src="../static/icon.png" class="logo" />
      </nuxt-link>
      <v-spacer />
      <ProductsHoverMenu></ProductsHoverMenu>
      <v-btn text large color="primary" href="/docs">docs</v-btn>
      <v-btn text large color="primary" href="/blogs">blogs</v-btn>
      <v-btn text large color="primary">search</v-btn>
      <v-btn text large color="primary" href="/github">github</v-btn>
    </v-app-bar>
    <v-main>
      <v-container>
        <nuxt />
      </v-container>
    </v-main>

    <Footer></Footer>
  </v-app>
</template>

<script>
export default {
  data() {
    return {
      title: "bridged",
    };
  },
};
</script>

<style lang="scss" scoped>
.logo {
  width: 36px;
  height: 36px;
}
</style>