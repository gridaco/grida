<template>
  <v-app light>
    <app-bar></app-bar>
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