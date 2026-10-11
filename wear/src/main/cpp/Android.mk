LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := dynamicengine
LOCAL_SRC_FILES := engine.c canvas2d.c quickjs/quickjs.c quickjs/libregexp.c quickjs/libunicode.c quickjs/dtoa.c
LOCAL_C_INCLUDES := $(LOCAL_PATH)
LOCAL_CFLAGS := -O2 -std=gnu11 -D_GNU_SOURCE -DNDEBUG -fwrapv -fvisibility=hidden \
    -Wno-unused-parameter -Wno-sign-compare -Wno-implicit-fallthrough -Wno-missing-field-initializers \
    -Wno-unused-function -Wno-unused-variable -Wno-c2x-extensions
LOCAL_LDLIBS := -lGLESv3 -lEGL -llog -landroid -lm
include $(BUILD_SHARED_LIBRARY)
