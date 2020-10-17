<template>
  <v-footer padless dark color="black">
    <v-row justify="center" no-gutters>
      <v-card flat tile class="black lighten-1 white--text text-center">
        <v-row>
          <v-col justify="center" no-gutters>
            <h2>1</h2>
            <h2>1</h2>
          </v-col>
          <v-col justify="center" no-gutters>
            <h2>1</h2>
            <h2>1</h2>
          </v-col>
          <v-col justify="center" no-gutters>
            <h2>1</h2>
            <h2>1</h2>
          </v-col>
        </v-row>

        <v-card-text>
          <v-btn v-for="s in social" :key="s" class="mx-4 white--text" icon :href="s.link">
            <v-icon size="24px">{{ s.icon }}</v-icon>
          </v-btn>
        </v-card-text>

        <v-card-text
          class="white--text pt-0"
        >BRIDGED UI framework by softmarshmallow under MIT license</v-card-text>

        <v-divider></v-divider>

        <v-card-text class="white--text">
          {{ new Date().getFullYear() }} —
          <strong>BRIDGED</strong>
        </v-card-text>
      </v-card>
    </v-row>
  </v-footer>
</template>

<script lang="ts">
import Vue from "vue";
import Component from "vue-class-component";
@Component
export default class Footer extends Vue {
  social: Array<SocialItem> = [
    {
      icon: "mdi-facebook",
      link: "https://facebook.com/bridged.xyz",
    },
    {
      icon: "mdi-twitter",
      link: "https://facebook.com/bridged.xyz",
    },
    {
      icon: "mdi-github",
      link: "https://github.com/bridgedxyz",
    },
    {
      icon: "mdi-instagram",
      link: "https://facebook.com/bridged.xyz",
    },
  ];
  products = ["inapp-bridge", "remote-ui"];
}

interface SocialItem {
  icon: string;
  link: string;
}
</script>