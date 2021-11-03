import React from "react";
import { ResizablePIP } from "@code-editor/preview-pip";
import { CodeEditor } from "components/code-editor";
import styled from "@emotion/styled";
export default function EmbedForVSCodeExtensionPage() {
  return (
    <>
      <ResizablePIP
        width={250}
        height={250}
        resizeHandles={["nw", "ne", "sw", "se"]}
        minConstraints={[100, 100]}
        maxConstraints={[500, 500]}
      >
        <iframe width="100%" height="100%" srcDoc={dummy_vanilla_src} />
      </ResizablePIP>
      <CodeEditor
        options={{
          renderFinalNewline: true,
        }}
        files={{
          "main.ts": {
            name: "main.ts",
            language: "typescript",
            raw: "// no code",
          },
        }}
        height="100vh"
      />
    </>
  );
}

const dummy_vanilla_src = `<html><head>
    <style>
#RootWrapperDemoApp {
				width: 375px;
				height: 824px;
				min-height: 100vh;
				overflow: hidden;
				background-color: rgba(255, 255, 255, 1);
				border-radius: 3px;
				position: relative;
				box-shadow: 0px 4px 32px rgba(0, 0, 0, 0.25);
			}
			
			#FriendsMusicSection {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: none;
				gap: 24px;
				width: 307px;
				height: 311px;
				box-sizing: border-box;
				position: absolute;
				left: 28px;
				top: 459px;
			}
			
			#LaurenIsListening {
				color: rgba(58, 58, 58, 1);
				text-overflow: ellipsis;
				font-size: 24px;
				font-family: Roboto, sans-serif;
				font-weight: 900;
				line-height: 90%;
				text-align: left;
				min-height: 22px;
				width: 232px;
			}
			
			#MusicSecondaryList {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: none;
				gap: 12px;
				width: 307px;
				height: 265px;
				box-sizing: border-box;
			}
			
			#DemoAppMusicCard1 {
				display: flex;
				justify-content: flex-start;
				flex-direction: row;
				align-items: start;
				flex: none;
				gap: 4px;
				box-shadow: 0px 4px 24px rgba(111, 111, 111, 0.08);
				border-radius: 4px;
				width: 307px;
				height: 79px;
				background-color: rgba(255, 255, 255, 1);
				box-sizing: border-box;
			}
			
			#DemoAppAlbumCover2 {
				width: 81px;
				position: relative;
				align-self: stretch;
			}
			
			#Rectangle825 {
				width: 81px;
				height: 79px;
				object-fit: cover;
				position: absolute;
				left: 0px;
				top: 0px;
			}
			
			#TrpLve {
				color: rgba(255, 255, 255, 1);
				text-overflow: ellipsis;
				font-size: 18px;
				font-family: Roboto, sans-serif;
				font-weight: 900;
				line-height: 90%;
				text-align: center;
				min-height: 32px;
				width: 37px;
				position: absolute;
				left: 22px;
				top: 24px;
				height: 32px;
			}
			
			#Frame524 {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: 1;
				gap: 10px;
				align-self: stretch;
				box-sizing: border-box;
				padding: 10px 10px;
			}
			
			#Frame519 {
				display: flex;
				justify-content: flex-end;
				flex-direction: row;
				align-items: center;
				flex: 1;
				gap: 20px;
				align-self: stretch;
				box-sizing: border-box;
				padding-right: 12px;
			}
			
			#Frame301 {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: none;
				gap: 5px;
				width: 146px;
				height: 59px;
				box-sizing: border-box;
			}
			
			#Trippe {
				color: rgba(0, 0, 0, 1);
				text-overflow: ellipsis;
				font-size: 18px;
				font-family: Roboto, sans-serif;
				font-weight: 900;
				line-height: 90%;
				text-align: left;
				align-self: stretch;
			}
			
			#MorningSlowbeatsLoFi {
				color: rgba(0, 0, 0, 0.6);
				text-overflow: ellipsis;
				font-size: 12px;
				font-family: Roboto, sans-serif;
				font-weight: 400;
				text-align: left;
				align-self: stretch;
			}
			
			#MusicPlayButton {
				width: 24px;
				height: 24px;
				object-fit: cover;
			}
			
			#DemoAppMusicCard2 {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: none;
				gap: 10px;
				border-radius: 4px;
				width: 307px;
				height: 81px;
				background-color: rgba(255, 255, 255, 1);
				box-sizing: border-box;
				padding: 8px 8px;
			}
			
			#Frame526 {
				display: flex;
				justify-content: flex-start;
				flex-direction: row;
				align-items: start;
				flex: 1;
				gap: 20px;
				align-self: stretch;
				box-sizing: border-box;
			}
			
			#DemoAppAlbumCover3 {
				width: 65px;
				height: 65px;
				position: relative;
			}
			
			#Rectangle825_0001 {
				width: 65px;
				height: 65px;
				object-fit: cover;
				position: absolute;
				left: 0px;
				top: 0px;
			}
			
			#Union {
				width: 47px;
				height: 47px;
				object-fit: cover;
				position: absolute;
			}
			
			#Frame523 {
				display: flex;
				justify-content: flex-end;
				flex-direction: row;
				align-items: center;
				flex: 1;
				gap: 22px;
				align-self: stretch;
				box-sizing: border-box;
				padding-right: 8px;
			}
			
			#Frame298 {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: 1;
				gap: 5px;
				align-self: stretch;
				box-sizing: border-box;
			}
			
			#Sweet {
				color: rgba(0, 0, 0, 1);
				text-overflow: ellipsis;
				font-size: 18px;
				font-family: Roboto, sans-serif;
				font-weight: 900;
				line-height: 90%;
				text-align: left;
			}
			
			#MorningSlowbeatsLoFi_0001 {
				color: rgba(0, 0, 0, 0.6);
				text-overflow: ellipsis;
				font-size: 12px;
				font-family: Roboto, sans-serif;
				font-weight: 400;
				text-align: left;
				align-self: stretch;
			}
			
			#MusicPlayButton_0001 {
				width: 24px;
				height: 24px;
				object-fit: cover;
			}
			
			#Group527 {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: none;
				gap: 10px;
				border-radius: 4px;
				width: 307px;
				height: 81px;
				background-color: rgba(255, 255, 255, 1);
				box-sizing: border-box;
				padding: 8px 8px;
			}
			
			#Frame526_0001 {
				display: flex;
				justify-content: flex-start;
				flex-direction: row;
				align-items: start;
				flex: 1;
				gap: 20px;
				align-self: stretch;
				box-sizing: border-box;
			}
			
			#DemoAppAlbumCover1 {
				width: 65px;
				height: 65px;
				position: relative;
			}
			
			#Rectangle813 {
				width: 65px;
				height: 65px;
				background-color: rgba(0, 0, 0, 1);
				border-radius: 8px;
				position: absolute;
				left: 0px;
				top: 0px;
			}
			
			#LoFi {
				color: rgba(255, 255, 255, 1);
				text-overflow: ellipsis;
				font-size: 36px;
				font-family: Helvetica, sans-serif;
				font-weight: 700;
				line-height: 90%;
				text-align: left;
				position: absolute;
				left: 4px;
				top: 32px;
			}
			
			#Frame523_0001 {
				display: flex;
				justify-content: flex-end;
				flex-direction: row;
				align-items: center;
				flex: 1;
				gap: 22px;
				align-self: stretch;
				box-sizing: border-box;
				padding-right: 8px;
			}
			
			#Frame298_0001 {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: 1;
				gap: 5px;
				align-self: stretch;
				box-sizing: border-box;
			}
			
			#Sweet_0001 {
				color: rgba(0, 0, 0, 1);
				text-overflow: ellipsis;
				font-size: 18px;
				font-family: Roboto, sans-serif;
				font-weight: 900;
				line-height: 90%;
				text-align: left;
			}
			
			#MorningSlowbeatsLoFi_0002 {
				color: rgba(0, 0, 0, 0.6);
				text-overflow: ellipsis;
				font-size: 12px;
				font-family: Roboto, sans-serif;
				font-weight: 400;
				text-align: left;
				align-self: stretch;
			}
			
			#MusicPlayButton_0002 {
				width: 24px;
				height: 24px;
				object-fit: cover;
			}
			
			#HeaderSection {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: none;
				gap: 16px;
				width: 315px;
				height: 128px;
				box-sizing: border-box;
				position: absolute;
				left: 28px;
				top: 64px;
			}
			
			#TitleAndAvatar {
				display: flex;
				justify-content: flex-start;
				flex-direction: row;
				align-items: start;
				flex: none;
				gap: 16px;
				width: 315px;
				height: 64px;
				box-sizing: border-box;
			}
			
			#Title {
				color: rgba(0, 0, 0, 1);
				text-overflow: ellipsis;
				font-size: 36px;
				font-family: Sen, sans-serif;
				font-weight: 700;
				line-height: 90%;
				text-align: left;
				min-height: 64px;
				width: 251px;
			}
			
			#AvatarSource {
				width: 48px;
				height: 48px;
				object-fit: cover;
			}
			
			#Subtitle {
				color: rgba(164, 164, 164, 1);
				text-overflow: ellipsis;
				font-size: 14px;
				font-family: Roboto, sans-serif;
				font-weight: 400;
				text-align: left;
				min-height: 48px;
				width: 315px;
			}
			
			#Group523 {
				width: 315px;
				height: 81px;
				position: absolute;
				left: 28px;
				top: 778px;
			}
			
			#Rectangle819 {
				width: 315px;
				height: 81px;
				background-color: rgba(255, 255, 255, 1);
				border-radius: 4px;
				position: absolute;
				left: 28px;
				top: 778px;
			}
			
			#Group519 {
				width: 24px;
				height: 24px;
				object-fit: cover;
				position: absolute;
				left: 291px;
				top: 807px;
			}
			
			#MorningSlowbeatsLoFi_0003 {
				color: rgba(0, 0, 0, 0.6);
				text-overflow: ellipsis;
				font-size: 12px;
				font-family: Roboto, sans-serif;
				font-weight: 400;
				text-align: left;
				min-height: 14px;
				width: 150px;
				position: absolute;
				left: 110px;
				top: 810px;
				height: 14px;
			}
			
			#Trippe_0001 {
				color: rgba(0, 0, 0, 1);
				text-overflow: ellipsis;
				font-size: 18px;
				font-family: Roboto, sans-serif;
				font-weight: 900;
				line-height: 90%;
				text-align: left;
				min-height: 16px;
				width: 61px;
				position: absolute;
				left: 110px;
				top: 789px;
				height: 16px;
			}
			
			#Rectangle825_0002 {
				width: 60px;
				height: 60px;
				background-color: rgba(0, 0, 0, 1);
				border-radius: 4px;
				position: absolute;
				left: 38px;
				top: 789px;
			}
			
			#DemoAppTabBar {
				height: 97px;
				position: absolute;
				left: 0px;
				right: 0px;
				bottom: -2px;
			}
			
			#Rectangle815 {
				width: 375px;
				height: 97px;
				box-shadow: 0px 0px 4px rgba(0, 0, 0, 0.25);
				background-color: rgba(255, 255, 255, 1);
				position: absolute;
				left: 0px;
				top: 0px;
			}
			
			#Tabs {
				display: flex;
				justify-content: space-between;
				flex-direction: row;
				align-items: start;
				flex: none;
				gap: 68px;
				width: 283px;
				height: 24px;
				box-sizing: border-box;
				position: absolute;
				left: 46px;
				top: 29px;
			}
			
			#IconsMdiHome {
				width: 24px;
				height: 24px;
				object-fit: cover;
			}
			
			#IconsMdiShowChart {
				width: 24px;
				height: 24px;
				object-fit: cover;
			}
			
			#IconsMdiSearch {
				width: 24px;
				height: 24px;
				object-fit: cover;
			}
			
			#PrimaryMusicCardsList {
				display: flex;
				justify-content: flex-start;
				flex-direction: row;
				align-items: start;
				flex: none;
				gap: 16px;
				width: 447px;
				height: 180px;
				box-sizing: border-box;
				position: absolute;
				left: 28px;
				top: 234px;
			}
			
			#DemoAppSomeComponent {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: none;
				gap: 4px;
				width: 138px;
				height: 180px;
				box-sizing: border-box;
			}
			
			#Frame305 {
				height: 144px;
				position: relative;
				align-self: stretch;
			}
			
			#DemoAppAlbumCover1_0001 {
				width: 138px;
				height: 144px;
				position: absolute;
				left: 0px;
				top: 0px;
			}
			
			#Rectangle813_0001 {
				width: 138px;
				height: 144px;
				background-color: rgba(0, 0, 0, 1);
				border-radius: 8px;
				position: absolute;
				left: 0px;
				top: 0px;
			}
			
			#LoFi_0001 {
				color: rgba(255, 255, 255, 1);
				text-overflow: ellipsis;
				font-size: 36px;
				font-family: Helvetica, sans-serif;
				font-weight: 700;
				line-height: 90%;
				text-align: left;
				position: absolute;
				left: 8px;
				top: 72px;
			}
			
			#MusicPlayButton_0003 {
				width: 28px;
				height: 28px;
				object-fit: cover;
				position: absolute;
				right: 16px;
				bottom: 14px;
			}
			
			#MorningSlowbeatsLoFi_0004 {
				color: rgba(164, 164, 164, 1);
				text-overflow: ellipsis;
				font-size: 14px;
				font-family: Roboto, sans-serif;
				font-weight: 400;
				text-align: left;
				align-self: stretch;
			}
			
			#DemoAppSomeComponent_0001 {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: none;
				gap: 4px;
				width: 138px;
				height: 180px;
				box-sizing: border-box;
			}
			
			#Frame305_0001 {
				height: 144px;
				position: relative;
				align-self: stretch;
			}
			
			#DemoAppAlbumCover3_0001 {
				width: 138px;
				height: 144px;
				position: absolute;
				left: 0px;
				top: 0px;
			}
			
			#Rectangle825_0003 {
				width: 138px;
				height: 144px;
				object-fit: cover;
				position: absolute;
				left: 0px;
				top: 0px;
			}
			
			#Union_0001 {
				width: 102px;
				height: 104px;
				object-fit: cover;
				position: absolute;
			}
			
			#MusicPlayButton_0004 {
				width: 28px;
				height: 28px;
				object-fit: cover;
				position: absolute;
				right: 16px;
				bottom: 14px;
			}
			
			#MorningSlowbeatsLoFi_0005 {
				color: rgba(164, 164, 164, 1);
				text-overflow: ellipsis;
				font-size: 14px;
				font-family: Roboto, sans-serif;
				font-weight: 400;
				text-align: left;
				align-self: stretch;
			}
			
			#DemoAppSomeComponent_0002 {
				display: flex;
				justify-content: flex-start;
				flex-direction: column;
				align-items: start;
				flex: none;
				gap: 4px;
				width: 138px;
				height: 180px;
				box-sizing: border-box;
			}
			
			#Frame305_0002 {
				height: 144px;
				position: relative;
				align-self: stretch;
			}
			
			#DemoAppAlbumCover2_0001 {
				width: 138px;
				height: 144px;
				position: absolute;
				left: 0px;
				top: 0px;
			}
			
			#Rectangle825_0004 {
				width: 138px;
				height: 144px;
				object-fit: cover;
				position: absolute;
				left: 0px;
				top: 0px;
			}
			
			#TrpLve_0001 {
				color: rgba(255, 255, 255, 1);
				text-overflow: ellipsis;
				font-size: 32px;
				font-family: Roboto, sans-serif;
				font-weight: 900;
				line-height: 90%;
				text-align: center;
				min-height: 58px;
				width: 64px;
				position: absolute;
				left: 38px;
				top: 43px;
				height: 58px;
			}
			
			#MusicPlayButton_0005 {
				width: 28px;
				height: 28px;
				object-fit: cover;
				position: absolute;
				right: 16px;
				bottom: 14px;
			}
			
			#MorningSlowbeatsLoFi_0006 {
				color: rgba(164, 164, 164, 1);
				text-overflow: ellipsis;
				font-size: 14px;
				font-family: Roboto, sans-serif;
				font-weight: 400;
				text-align: left;
				align-self: stretch;
			}
			
			* {
				margin: 0px;
				font-family: Helvetica, "Helvetica Neue", Roboto, Noto, Arial, sans-serif;
			}
    </style>
  </head>
  <body>
<div id="RootWrapperDemoApp">
		    <div id="FriendsMusicSection">
		      <span id="LaurenIsListening">
		        Lauren is listening
		      </span>
		    <div id="MusicSecondaryList">
		        <div id="DemoAppMusicCard1">
		          <div id="DemoAppAlbumCover2">
		            <img src="blob:https://assistant-serve.grida.co/7a95330f-e0de-410f-89df-cfa3c9ef72a5" alt="image of Rectangle825" id="Rectangle825">
		          <span id="TrpLve">
		              TRP<br>
		            LVE
		            </span>
		          </div>
		        <div id="Frame524">
		            <div id="Frame519">
		              <div id="Frame301">
		                <span id="Trippe">
		                  TRIPPE
		                </span>
		              <span id="MorningSlowbeatsLoFi">
		                  Morning Slowbeats - LoFi
		                </span>
		              </div>
		            <img src="blob:https://assistant-serve.grida.co/3b01e7c9-7002-4855-a477-96713c5d55c5" alt="icon" id="MusicPlayButton">
		            </div>
		          </div>
		        </div>
		      <div id="DemoAppMusicCard2">
		          <div id="Frame526">
		            <div id="DemoAppAlbumCover3">
		              <img src="blob:https://assistant-serve.grida.co/c5235238-9e22-49c9-bc60-45fc3ab1b9e1" alt="image of Rectangle825" id="Rectangle825_0001">
		            <img src="blob:https://assistant-serve.grida.co/87b43c13-3164-49a9-92a7-24f4c2504ce2" alt="image of Union" id="Union">
		            </div>
		          <div id="Frame523">
		              <div id="Frame298">
		                <span id="Sweet">
		                  Sweet
		                </span>
		              <span id="MorningSlowbeatsLoFi_0001">
		                  Morning Slowbeats - LoFi
		                </span>
		              </div>
		            <img src="blob:https://assistant-serve.grida.co/b66e907e-f5ab-4a0c-a47b-037ae3684324" alt="icon" id="MusicPlayButton_0001">
		            </div>
		          </div>
		        </div>
		      <div id="Group527">
		          <div id="Frame526_0001">
		            <div id="DemoAppAlbumCover1">
		              <div id="Rectangle813"></div>
		            <span id="LoFi">
		                LO<br>
		              FI
		              </span>
		            </div>
		          <div id="Frame523_0001">
		              <div id="Frame298_0001">
		                <span id="Sweet_0001">
		                  Falling
		                </span>
		              <span id="MorningSlowbeatsLoFi_0002">
		                  Morning Slowbeats - LoFi
		                </span>
		              </div>
		            <img src="blob:https://assistant-serve.grida.co/1e9cb7cf-ee38-414a-9b72-606fbbada910" alt="icon" id="MusicPlayButton_0002">
		            </div>
		          </div>
		        </div>
		      </div>
		    </div>
		  <div id="HeaderSection">
		      <div id="TitleAndAvatar">
		        <span id="Title">
		          Saturday Morning Mix
		        </span>
		      <img src="blob:https://assistant-serve.grida.co/532102b2-e6d9-43e3-93c2-ea31745069ea" alt="image of AvatarSource" id="AvatarSource">
		      </div>
		    <span id="Subtitle">
		        Here are some tunes for you to start your morning. Mostly quiet and slow-beat, some of them are mood changer.
		      </span>
		    </div>
		  <div id="Group523">
		      <div id="Rectangle819"></div>
		    <img src="blob:https://assistant-serve.grida.co/fd526ba9-12a9-46b3-9cd0-ec4fbc9c50a3" alt="icon" id="Group519">
		    <span id="MorningSlowbeatsLoFi_0003">
		        Morning Slowbeats - LoFi
		      </span>
		    <span id="Trippe_0001">
		        TRIPPE
		      </span>
		    <div id="Rectangle825_0002"></div>
		    </div>
		  <div id="DemoAppTabBar">
		      <div id="Rectangle815"></div>
		    <div id="Tabs">
		        <img src="blob:https://assistant-serve.grida.co/1b248866-1306-4470-bea2-165551591b3a" alt="image of IconsMdiHome" id="IconsMdiHome">
		      <img src="blob:https://assistant-serve.grida.co/778effd8-12ad-481c-b4b1-ebe5d4c664e7" alt="image of IconsMdiShowChart" id="IconsMdiShowChart">
		      <img src="blob:https://assistant-serve.grida.co/e2be9321-bcd5-4962-9a54-ab611cb34eb3" alt="image of IconsMdiSearch" id="IconsMdiSearch">
		      </div>
		    </div>
		  <div id="PrimaryMusicCardsList">
		      <div id="DemoAppSomeComponent">
		        <div id="Frame305">
		          <div id="DemoAppAlbumCover1_0001">
		            <div id="Rectangle813_0001"></div>
		          <span id="LoFi_0001">
		              LO<br>
		            FI
		            </span>
		          </div>
		        <img src="blob:https://assistant-serve.grida.co/dc823cc7-3a06-4808-b5cb-3e83e403ecde" alt="icon" id="MusicPlayButton_0003">
		        </div>
		      <span id="MorningSlowbeatsLoFi_0004">
		          Morning Slowbeats - LoFi
		        </span>
		      </div>
		    <div id="DemoAppSomeComponent_0001">
		        <div id="Frame305_0001">
		          <div id="DemoAppAlbumCover3_0001">
		            <img src="blob:https://assistant-serve.grida.co/8cc13c3c-ca2c-4e63-846c-1431d96b5fd2" alt="image of Rectangle825" id="Rectangle825_0003">
		          <img src="blob:https://assistant-serve.grida.co/c757ad1a-6ade-45a1-b997-f06edc4bbf5b" alt="image of Union" id="Union_0001">
		          </div>
		        <img src="blob:https://assistant-serve.grida.co/1f1c6503-64f6-44ea-88fb-0fc16de070a1" alt="icon" id="MusicPlayButton_0004">
		        </div>
		      <span id="MorningSlowbeatsLoFi_0005">
		          Morning Slowbeats - LoFi
		        </span>
		      </div>
		    <div id="DemoAppSomeComponent_0002">
		        <div id="Frame305_0002">
		          <div id="DemoAppAlbumCover2_0001">
		            <img src="blob:https://assistant-serve.grida.co/e402ac0a-b1e8-4784-8af0-8df732094f34" alt="image of Rectangle825" id="Rectangle825_0004">
		          <span id="TrpLve_0001">
		              TRP<br>
		            LVE
		            </span>
		          </div>
		        <img src="blob:https://assistant-serve.grida.co/13a05d67-953d-47ff-8036-5535d4b15ae5" alt="icon" id="MusicPlayButton_0005">
		        </div>
		      <span id="MorningSlowbeatsLoFi_0006">
		          Morning Slowbeats - LoFi
		        </span>
		      </div>
		    </div>
		  </div>
  
</body></html>`;
