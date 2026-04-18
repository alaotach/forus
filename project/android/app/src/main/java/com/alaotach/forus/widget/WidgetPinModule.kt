package com.alaotach.forus.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import android.os.Bundle
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetPinModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "WidgetPinModule"

  @ReactMethod
  fun requestPinWidgetForSize(cols: Int, rows: Int, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve(false)
        return
      }

      val appWidgetManager = AppWidgetManager.getInstance(reactContext)
      if (!appWidgetManager.isRequestPinAppWidgetSupported) {
        promise.resolve(false)
        return
      }

      val providerClass = when {
        cols == 3 && rows == 3 -> ForusSharedCanvas3x3::class.java
        cols == 4 && rows == 4 -> ForusSharedCanvas4x4::class.java
        else -> ForusSharedCanvas::class.java
      }

      val provider = ComponentName(reactContext, providerClass)
      val options = Bundle().apply {
        // Hint preferred dimensions to launcher; actual final size depends on launcher behavior.
        val minWidthDp = cols.coerceAtLeast(1) * 72
        val minHeightDp = rows.coerceAtLeast(1) * 72
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, minWidthDp)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, minHeightDp)
      }

      val accepted = appWidgetManager.requestPinAppWidget(provider, options, null)
      promise.resolve(accepted)
    } catch (error: Exception) {
      promise.reject("WIDGET_PIN_FAILED", error)
    }
  }
}
