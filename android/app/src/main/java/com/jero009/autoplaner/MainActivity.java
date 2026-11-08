package com.jero009.autoplaner;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DeviceCalendarPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
