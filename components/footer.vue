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
          <v-btn v-for="icon in icons" :key="icon" class="mx-4 white--text" icon>
            <v-icon size="24px">{{ icon }}</v-icon>
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

<script>
import Vue from "vue";
import Component from "vue-class-component";
@Component
export default class Footer extends Vue {
  icons = ["mdi-facebook", "mdi-twitter", "mdi-linkedin", "mdi-instagram"];
  products = ["inapp-bridge", "remote-ui"];
}
</script>