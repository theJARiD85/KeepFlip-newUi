import React, { useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";


export type Thought = {
  id: string;
  text: string;
  confidence?: string;
  type?: "analysis" | "success" | "warning";
};


type ScannerThoughtStreamProps = {
  thoughts: Thought[];
};



function ThoughtCard({
  thought,
  index,
}: {
  thought: Thought;
  index: number;
}) {

  const drift =
    useSharedValue(0);


  useEffect(() => {

    drift.value =
      withRepeat(
        withTiming(
          1,
          {
            duration:
              2500 +
              index * 500,
            easing:
              Easing.inOut(
                Easing.sin
              ),
          }
        ),
        -1,
        true
      );

  }, []);



  const floatingStyle =
    useAnimatedStyle(() => {

      return {
        transform: [
          {
            translateY:
              drift.value * 6,
          },
          {
            translateX:
              drift.value * 3,
          },
        ],
      };

    });



  return (

    <Animated.View
      entering={
        FadeIn
          .duration(450)
          .delay(index * 120)
      }
      exiting={
        FadeOut
          .duration(300)
      }
      style={[
        styles.card,
        floatingStyle,
      ]}
    >

      <Text
        style={[
          styles.prefix,
          thought.type === "success" &&
            styles.success,
        ]}
      >
        {">"}
      </Text>


      <View
        style={
          styles.content
        }
      >

        <Text
          style={[
            styles.text,
            thought.type === "success" &&
              styles.success,
          ]}
        >
          {thought.text}
        </Text>


        {thought.confidence && (

          <Text
            style={
              styles.confidence
            }
          >
            {thought.confidence}
          </Text>

        )}

      </View>

    </Animated.View>

  );
}



export function ScannerThoughtStream({
  thoughts,
}: ScannerThoughtStreamProps) {


  return (

    <View
      pointerEvents="none"
      style={
        styles.container
      }
    >

      {thoughts.map(
        (
          thought,
          index
        ) => (

          <ThoughtCard
            key={
              thought.id
            }
            thought={
              thought
            }
            index={
              index
            }
          />

        )
      )}

    </View>

  );

}



const styles = StyleSheet.create({

  container: {
    position:
      "absolute",
    top:
      110,
    left:
      20,
    right:
      20,

    gap:
      14,
  },


  card: {

    alignSelf:
      "flex-start",

    flexDirection:
      "row",

    alignItems:
      "center",

    paddingHorizontal:
      14,

    paddingVertical:
      9,

    borderRadius:
      8,


    backgroundColor:
      "rgba(0, 8, 14, 0.78)",


    borderWidth:
      1,

    borderColor:
      "rgba(88,223,232,0.55)",


    shadowColor:
      "#00E5FF",

    shadowOpacity:
      0.8,

    shadowRadius:
      12,

    elevation:
      8,

  },


  prefix: {

    color:
      "#00E5FF",

    fontSize:
      18,

    fontWeight:
      "900",

    marginRight:
      8,

  },


  content: {

    flexDirection:
      "column",

  },


  text: {

    color:
      "#D8F9FF",

    fontSize:
      12,

    fontWeight:
      "700",

    letterSpacing:
      1,

  },


  confidence: {

    marginTop:
      3,

    color:
      "#58DFE8",

    fontSize:
      11,

    fontWeight:
      "600",

  },


  success: {

    color:
      "#F2D38A",

  },

});