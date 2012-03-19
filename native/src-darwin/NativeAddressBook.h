#include "INativeAddressBook.h"

#define NATIVEADDRESSBOOK_CONTRACTID	"@labs.mozilla.com/NativeAddressBook;1"
#define NATIVEADDRESSBOOK_CLASSNAME		"NativeAddressBook"

/* Header file */
class NativeAddressBook : public INativeAddressBook
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_INATIVEADDRESSBOOK

  NativeAddressBook();

private:
  ~NativeAddressBook();

protected:
  /* additional members */
};
