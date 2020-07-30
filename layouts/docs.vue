<template>
  <v-app light>
    <app-bar></app-bar>

    <v-main>
      <v-container>
        <v-row>
          <v-card elevation="0" width="180">
            <v-navigation-drawer floating permanent>
              <v-list dense rounded>
                <v-list-item v-for="item in items" :key="item.title" link nuxt>
                  <v-list-item-content>
                    <v-list-item-title>{{ item.title }}</v-list-item-title>
                  </v-list-item-content>
                </v-list-item>
              </v-list>
            </v-navigation-drawer>
          </v-card>
          <div class="pa-6">
            <nuxt />
          </div>
        </v-row>
      </v-container>
    </v-main>

    <Footer></Footer>
  </v-app>
</template>


<script lang="ts">
import Vue from "vue";
import Component from "vue-class-component";

@Component
export default class Docs extends Vue {
  items = [
    { title: "introduction", to: "/docs" },
    { title: "remote-ui/flutter", to: "/docs/remote-ui" },
  ];
}
</script>