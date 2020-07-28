<template>
  <v-app light>
    <v-app-bar fixed color="white" elevate-on-scroll app>
      <!--      <v-toolbar-title v-text="title" />-->
      <img src="../static/icon.png" class="logo" />
      <v-spacer />
      <v-btn text large color="primary">products</v-btn>
      <v-btn text large color="primary">docs</v-btn>
      <v-btn text large color="primary">blogs</v-btn>
      <v-btn text large color="primary">search</v-btn>
      <v-btn text large color="primary">github</v-btn>
    </v-app-bar>
    <v-main>
      <v-container>
        <nuxt />
      </v-container>
    </v-main>
    <v-footer app>
      <span>&copy; {{ new Date().getFullYear() }}</span>
    </v-footer>
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