import React, { useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  Dimensions,
} from "react-native";

import {
  Canvas,
  Rect,
  Skia,
  Shader,
} from "@shopify/react-native-skia";

import {
    useSharedValue,
    useDerivedValue,
    withTiming,
    Easing,
  } from "react-native-reanimated";

type ScannerAtmosphereProps = {
    width: number;
    height: number;
    active?: boolean;
  };

const { width, height } = Dimensions.get("window");


// AGSL Shader simulating feature detection -> node alignment -> analytical lockdown
const cognitiveShader = Skia.RuntimeEffect.Make(`

uniform vec2 u_res;
uniform float u_time;
uniform float u_progress;


float hash(vec2 p) {
  return fract(
    sin(dot(p, vec2(127.1, 311.7))) *
    43758.5453123
  );
}


float neuralNetwork(vec2 p, float speedMultiplier) {

  vec2 i = floor(p);
  vec2 f = fract(p);

  float minDist = 1.0;


  for (int y = -1; y <= 1; y++) {

    for (int x = -1; x <= 1; x++) {

      vec2 neighbor = vec2(
        float(x),
        float(y)
      );


      vec2 point =
        vec2(
          hash(i + neighbor),
          hash(i + neighbor + 89.0)
        );


      float movementPhase =
        mix(
          u_time * speedMultiplier,
          sin(u_time * 0.2),
          u_progress
        );


      point =
        0.5 +
        0.5 *
        sin(
          movementPhase +
          point * 6.2831
        );


      float dist =
        length(
          neighbor +
          point -
          f
        );


      minDist =
        min(
          minDist,
          dist
        );
    }
  }


  return minDist;
}



vec4 main(vec2 pos) {


  vec2 uv =
    pos /
    u_res;


  vec2 centerUv =
    uv -
    0.5;


  float gridDensity =
    mix(
      6.0,
      14.0,
      u_progress
    );


  vec2 st =
    uv *
    gridDensity;


  float rawFeatures =
    neuralNetwork(
      st,
      4.0
    );


  float featuresGlow =
    smoothstep(
      0.35,
      0.0,
      rawFeatures
    );



  float structuralVectors =
    neuralNetwork(
      st * 0.5,
      1.5
    );


  float vectorsGlow =
    smoothstep(
      0.4,
      0.0,
      structuralVectors
    );



  float cognitiveState =
    mix(
      featuresGlow * 0.5,
      vectorsGlow * 0.8,
      u_progress
    );



  float radius =
    length(
      centerUv
    );


  float ringPattern =
    sin(
      radius * 40.0 -
      u_time * 2.0
    );


  float targetLock =
    smoothstep(
      0.98,
      1.0,
      ringPattern
    )
    *
    u_progress
    *
    0.4;



  float finalGlow =
    cognitiveState +
    targetLock;



  vec3 analyticalColor =
    vec3(
      1.0,
      0.4,
      0.1
    );


  vec3 confidentColor =
    vec3(
      0.0,
      0.9,
      1.0
    );


  vec3 dynamicPalette =
    mix(
      analyticalColor,
      confidentColor,
      u_progress
    );



  float edgeMask =
    smoothstep(
      0.0,
      0.15,
      uv.x
    )
    *
    smoothstep(
      1.0,
      0.85,
      uv.x
    )
    *
    smoothstep(
      0.0,
      0.15,
      uv.y
    )
    *
    smoothstep(
      1.0,
      0.85,
      uv.y
    );



  return vec4(
    dynamicPalette *
    (finalGlow + 0.05),
    finalGlow *
    edgeMask
  );

}

`)!;



export function ScannerAtmosphere({  
    width,
    height,
    active = true,
  }: ScannerAtmosphereProps) {


  const animatedTime =
    useSharedValue(0);


  const animatedProgress =
    useSharedValue(0);



  useEffect(() => {


    animatedTime.value =
      withTiming(
        100,
        {
          duration: 50000,
          easing: Easing.linear,
        }
      );



    animatedProgress.value =
      withTiming(
        1,
        {
          duration: 4000,
          easing: Easing.out(
            Easing.quad
          ),
        }
      );


  }, [
    animatedTime,
    animatedProgress,
  ]);



  const uniforms =
    useDerivedValue(() => ({
      u_res: [
        width * 0.9,
        height * 0.55,
      ],

      u_time:
        animatedTime.value,

      u_progress:
        animatedProgress.value,
    }));



  const shader =
    useMemo(
      () => (
        <Shader
          source={cognitiveShader}
          uniforms={uniforms}
        />
      ),
      [
        uniforms,
      ]
    );



  return (

    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >

      <Canvas
        style={styles.canvas}
      >

        <Rect
          x={width * 0.05}
          y={height * 0.15}
          width={width * 0.9}
          height={height * 0.55}
        >

          {shader}

        </Rect>

      </Canvas>

    </View>

  );
}



const styles = StyleSheet.create({

  canvas: {
    ...StyleSheet.absoluteFill,
  },

});