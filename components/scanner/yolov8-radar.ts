export const YOLOV8_MODEL_SIZE = 640;
export const YOLOV8_CANDIDATE_COUNT = 8400;
export const YOLOV8_CLASS_COUNT = 80;
export const YOLOV8_OUTPUT_CHANNELS = 4 + YOLOV8_CLASS_COUNT;
export const YOLOV8_OUTPUT_ELEMENTS =
  YOLOV8_OUTPUT_CHANNELS * YOLOV8_CANDIDATE_COUNT;
export const YOLOV8_INPUT_BYTES =
  YOLOV8_MODEL_SIZE *
  YOLOV8_MODEL_SIZE *
  3 *
  Float32Array.BYTES_PER_ELEMENT;

/**
 * Camera worklets import only the primitive tensor metadata above. The decoder
 * itself stays inline because functions do not remain callable after Android's
 * second async-runtime hop. This label helper runs later on the RN thread.
 */
export function yoloV8RadarCategoryLabel(classId: number) {
  const labels: Record<number, string> = {
    1: "Bicycle",
    2: "Vehicle",
    3: "Motorcycle",
    5: "Vehicle",
    7: "Truck",
    8: "Boat",
    13: "Bench",
    24: "Backpack",
    25: "Umbrella",
    26: "Handbag",
    27: "Tie",
    28: "Suitcase",
    29: "Frisbee",
    30: "Skis",
    31: "Snowboard",
    32: "Sports gear",
    33: "Kite",
    34: "Baseball bat",
    35: "Baseball glove",
    36: "Skateboard",
    37: "Surfboard",
    38: "Tennis racket",
    39: "Bottle",
    40: "Glassware",
    41: "Cup",
    42: "Flatware",
    43: "Knife",
    44: "Flatware",
    45: "Bowl",
    56: "Chair",
    57: "Couch",
    58: "Plant",
    59: "Bed",
    60: "Table",
    62: "TV",
    63: "Laptop",
    64: "Computer mouse",
    65: "Remote",
    66: "Keyboard",
    67: "Cell phone",
    68: "Microwave",
    69: "Oven",
    70: "Toaster",
    72: "Refrigerator",
    73: "Book",
    74: "Clock",
    75: "Vase",
    76: "Scissors",
    77: "Teddy bear",
    78: "Hair dryer",
    79: "Toothbrush",
  };

  return labels[classId] ?? "Item";
}
