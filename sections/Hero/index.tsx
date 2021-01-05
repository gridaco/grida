import {
  Typography,
  Button,
  CardMedia,
  Card,
  CardActionArea,
  IconButton,
} from '@material-ui/core';
import React, { useState } from 'react';
import { CustomButton, Text } from '../../components';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.scss';
import { BRIDGED_COMMUNITY_FLUTTER } from '../../common/toolkit';
import { heroContents } from './toolkit';
import { VideoPlayer } from '../Hero/videoPlayer';

// @ts-ignore
import videoPreview from '../../images/hero-video-preview.png';
// @ts-ignore
import videoPlayBtn from '../../images/video-play.svg';
import CloseIcon from '@material-ui/icons/Close';

const Hero = () => {
  const [isPlayer, setIsPlayer] = useState('none');

  const ControlPlayer = (display: string) => {
    setIsPlayer(display);
  };

  return (
    <>
      <div className={styles.title_box}>
        <Text
          algin="center"
          variant="h1"
          value={heroContents.title()}
          style={{ color: '#FFF' }}
        />
        <div className={styles.sub_title}>
          <Text algin="center" variant="h6" value={heroContents.subTitle()} />
        </div>

        <div style={{ textAlign: 'center', marginTop: '41px' }}>
          <Button
            variant="contained"
            href={BRIDGED_COMMUNITY_FLUTTER}
            type="default"
            className={home.btn}
          >
            <Text variant="button" value="GET STARTED" />
          </Button>
        </div>
        <div className={styles.video_player_wrapper}>
          <div className={styles.video}>
            <img
              src={videoPreview}
              className={styles.video}
              alt="video preview"
              onClick={() => {
                ControlPlayer('block');
              }}
            />
            <img
              src={videoPlayBtn}
              className={styles.video_play}
              alt="video player button"
              onClick={() => {
                ControlPlayer('block');
              }}
            />
          </div>

          <div
            className={styles.youtube_player}
            style={{ display: `${isPlayer}` }}
          >
            <div className={styles.player_background}>
              <IconButton
                aria-label="add to shopping cart"
                onClick={() => {
                  ControlPlayer('none');
                }}
                style={{ color: '#fff' }}
              >
                <CloseIcon fontSize="large" />
              </IconButton>
            </div>
            <div className={styles.youtube_player_wrapper}>
              <iframe
                width="640"
                height="360"
                src="https://www.youtube.com/embed/RIZjZFoDhRc?autoplay=1&mute=1"
                frameborder="0"
                allowfullscreen="1"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              ></iframe>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Hero;
