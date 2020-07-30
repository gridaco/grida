<template>
  <v-app-bar fixed color="white" elevate-on-scroll app>
    <!--      <v-toolbar-title v-text="title" />-->
    <nuxt-link to="/">
      <img src="../../static/icon.png" class="logo" />
    </nuxt-link>
    <v-spacer />
    <ProductsHoverMenu></ProductsHoverMenu>
    <v-btn text large color="primary" to="/docs" nuxt>docs</v-btn>
    <v-btn text large color="primary" to="/blogs" nuxt>blogs</v-btn>
    <v-btn text large color="primary">search</v-btn>
    <v-btn text large color="primary" to="/github" nuxt>github</v-btn>
  </v-app-bar>
</template>



<script lang="ts">
import Vue from "vue";
export default Vue.extend({});
</script>


<style lang="sass" scoped>

</style>