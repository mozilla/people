#
# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is Weave code.
#
# The Initial Developer of the Original Code is
# Mozilla Corporation
# Portions created by the Initial Developer are Copyright (C) 2008
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   Dan Mills <thunder@mozilla.com> (original author)
#   Godwin Chan <godwinchan@hotmail.com> (Darwin Universal Binary)
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****

# OS detection

sys := $(shell uname -s)
link = link

ifeq ($(sys), Darwin)
  os = Darwin
  compiler = gcc3
  cxx = c++
  so = dylib
  cppflags += -dynamiclib -DDEBUG -DMOZ_NO_MOZALLOC
else
  $(error Sorry, your os is unknown/unsupported: $(sys))
endif

# Arch detection
machine := $(shell uname -m)
ifeq ($(machine), i386)
  arch = x86
else
ifeq ($(machine), i586)
  arch = x86
else
ifeq ($(machine), i686)
  arch = x86
else
ifeq ($(machine), i86pc)
  arch = x86
else
ifeq ($(machine), ppc)
  arch = ppc
else
ifeq ($(machine), Power Macintosh)
  arch = ppc
else
  $(error: Sorry, your architecture is unknown/unsupported: $(machine))
endif
endif
endif
endif
endif
endif

# Universal binary 
platform = $(os)

###################################################################
# Target and objects

target = NativeAddressBook
so_target = $(target:=.$(so))
cpp_objects = $(cpp_sources:.cpp=.o)

# source and path configurations
idl = INativeAddressBook.idl INativeAddressCard.idl
cpp_sources = NativeAddressBook.cpp NativeAddressCard.cpp

sdkdir_32 ?= ${MOZSDKDIR}
sdkdir_64 ?= ${MOZSDKDIR}/../../x86_64/dist/
destdir = ..
platformdir = $(destdir)/platform/$(platform)

# FIXME: we don't actually require this for e.g. clean
ifeq ($(sdkdir_32),)
  $(warning The MOZSDKDIR environment variable was not set)
  $(warning Please set it to point to a valid Gecko SDK)
  $(error )
endif
ifeq ($(sdkdir_64),)
  $(warning No 64-bit Gecko SDK found)
  $(warning Not building universal component)
endif

xpidl = $(sdkdir_32)/bin/xpidl
idl_headers = $(idl:.idl=.h)
idl_typelib = $(idl:.idl=.xpt)
so_target = $(target:=.$(so))
so_target_32 = $(target:=.$(so).32)
so_target_64 = $(target:=.$(so).64)
cpp_objects_32 = $(cpp_sources:.cpp=.o32)
cpp_objects_64 = $(cpp_sources:.cpp=.o64)

headers_32 = -I$(sdkdir_32)/include \
          -I$(sdkdir_32)/include/system_wrappers \
          -I$(sdkdir_32)/include/nss \
          -I$(sdkdir_32)/include/xpcom \
          -I$(sdkdir_32)/include/string \
          -I$(sdkdir_32)/include/pipnss \
          -I$(sdkdir_32)/include/nspr \
          -I$(sdkdir_32)/sdk/include
headers_64 = -I$(sdkdir_64)/include \
          -I$(sdkdir_64)/include/system_wrappers \
          -I$(sdkdir_64)/include/nss \
          -I$(sdkdir_64)/include/xpcom \
          -I$(sdkdir_64)/include/string \
          -I$(sdkdir_64)/include/pipnss \
          -I$(sdkdir_64)/include/nspr \
          -I$(sdkdir_64)/sdk/include

# libraries
libdirs_32 := -L$(sdkdir_32)/lib -L$(sdkdir_32)/bin
libdirs_64 := -L$(sdkdir_64)/lib -L$(sdkdir_64)/bin
libs := xpcomglue_s xpcom nspr4 

# compiler and Linker Flags
ifeq ($(os), Darwin)
  libs := $(patsubst %,-l%,$(libs))
  cppflags += -c -pipe -Os \
				-fPIC -fno-rtti -fno-exceptions -fno-strict-aliasing \
                -fno-common -fshort-wchar -fpascal-strings -pthread \
                -Wall -Wconversion -Wpointer-arith -Woverloaded-virtual -Wsynth \
                -Wno-ctor-dtor-privacy -Wno-non-virtual-dtor -Wcast-align \
                -Wno-long-long -include xpcom-config.h \
                -isysroot /Developer/SDKs/MacOSX10.6.sdk
  ldflags_32 += -pthread -pipe -bundle -arch i386 \
                -Wl,-executable_path,$(sdkdir_32)/bin \
                -Wl,-dead_strip \
                -Wl,-syslibroot,/Developer/SDKs/MacOSX10.6.sdk \
                $(libdirs_32) $(libs) -framework AddressBook -framework CoreFoundation
  ldflags_64 += -pthread -pipe -bundle -arch x86_64 \
                -Wl,-executable_path,$(sdkdir_64)/bin \
                -Wl,-dead_strip \
                -Wl,-syslibroot,/Developer/SDKs/MacOSX10.6.sdk \
                $(libdirs_64) $(libs) -framework AddressBook -framework CoreFoundation
  cppflags_32 += $(cppflags) $(headers_32) -arch i386
  cppflags_64 += $(cppflags) $(headers_64) -arch x86_64
endif

######################################################################

.PHONY: all build install clean subst

all: build # default target

build: subst $(so_target) $(idl_typelib)

install: build
	mkdir -p $(destdir)/components
	mkdir -p $(platformdir)/components
	cp $(idl_typelib) $(destdir)/components
	cp $(so_target) $(platformdir)/components

clean: 
	rm -f $(so_target) $(so_target_32) $(so_target_64) \
            $(cpp_objects_32) $(cpp_objects_64) \
            $(idl_typelib) $(idl_headers) \
			$(target:=.res) fake.lib fake.exp NativeAddressBook.rc

subst:
	$(substitute) NativeAddressBook.rc.in > NativeAddressBook.rc

# rules to build the c headers and .xpt from idl
$(idl_headers): $(idl)
	$(xpidl) -m header -I$(sdkdir_32)/idl $(@:.h=.idl)

$(idl_typelib): $(idl)
	$(xpidl) -m typelib -I$(sdkdir_32)/idl $(@:.xpt=.idl)

# build and link rules
ifeq ($(sdkdir_64),)
  $(cpp_objects_32): $(cpp_sources)
	$(cxx) -o $@ $(cppflags_32) $(@:.o32=.cpp)

  $(so_target): $(idl_headers) $(cpp_objects_32)
	$(cxx) -o $@ $(ldflags_32) $(cpp_objects_32)
	chmod +x $@
else
  $(cpp_objects_32): $(cpp_sources)
	$(cxx) -o $@ $(cppflags_32) $(@:.o32=.cpp)

  $(cpp_objects_64): $(cpp_sources)
	$(cxx) -o $@ $(cppflags_64) $(@:.o64=.cpp)

  $(so_target_32): $(idl_headers) $(cpp_objects_32)
	$(cxx) -o $@ $(ldflags_32) $(cpp_objects_32)
	chmod +x $@
  
  $(so_target_64): $(idl_headers) $(cpp_objects_64)
	$(cxx) -o $@ $(ldflags_64) $(cpp_objects_64)
	chmod +x $@

  $(so_target): $(so_target_32) $(so_target_64)
	lipo $(so_target_32) $(so_target_64) -create -output $@
	chmod +x $@
endif
